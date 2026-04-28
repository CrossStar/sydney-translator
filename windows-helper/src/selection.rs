use crate::events::HelperEvent;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SelectionMode {
    Hotkey,
    AutoPopup,
}

pub fn parse_selection_mode(value: &str) -> SelectionMode {
    match value.trim().to_ascii_lowercase().as_str() {
        "auto-popup" => SelectionMode::AutoPopup,
        _ => SelectionMode::Hotkey,
    }
}

pub fn build_selection_event(text: String) -> HelperEvent {
    HelperEvent::selection_text(text)
}

pub fn should_emit_selection_text(text: Option<String>) -> Option<HelperEvent> {
    let text = text?.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(build_selection_event(text))
}

pub fn next_selection_event(last_text: &mut Option<String>, text: Option<String>) -> Option<HelperEvent> {
    let event = should_emit_selection_text(text)?;
    if last_text.as_deref() == event.text.as_deref() {
        return None;
    }
    *last_text = event.text.clone();
    Some(event)
}

pub fn should_probe_selection(was_pressed: bool, is_pressed: bool) -> bool {
    was_pressed && !is_pressed
}

#[cfg(target_os = "windows")]
fn normalize_selection_text(text: String) -> Option<String> {
    let text = text.replace('\u{feff}', "");
    let text = text.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(text)
}

#[cfg(target_os = "windows")]
fn text_from_text_ranges(
    ranges: &windows::Win32::UI::Accessibility::IUIAutomationTextRangeArray,
) -> anyhow::Result<Option<String>> {
    use anyhow::Context;

    let count = unsafe { ranges.Length().context("failed to get selection range count")? };
    for index in 0..count {
        let range = unsafe {
            ranges
                .GetElement(index)
                .with_context(|| format!("failed to get selection range at index {index}"))?
        };
        let text = unsafe {
            range
                .GetText(-1)
                .with_context(|| format!("failed to read selection range text at index {index}"))?
                .to_string()
        };
        if let Some(text) = normalize_selection_text(text) {
            return Ok(Some(text));
        }
    }

    Ok(None)
}

#[cfg(target_os = "windows")]
fn text_from_element(
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> anyhow::Result<Option<String>> {
    use anyhow::Context;
    use windows::Win32::UI::Accessibility::{IUIAutomationTextPattern, UIA_TextPatternId};

    let pattern: IUIAutomationTextPattern = match unsafe { element.GetCurrentPatternAs(UIA_TextPatternId) } {
        Ok(pattern) => pattern,
        Err(_) => return Ok(None),
    };

    let ranges = unsafe {
        pattern
            .GetSelection()
            .context("failed to get text selection")?
    };

    text_from_text_ranges(&ranges)
}

#[cfg(target_os = "windows")]
fn text_from_legacy_pattern(
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> anyhow::Result<Option<String>> {
    use anyhow::Context;
    use windows::Win32::UI::Accessibility::{
        IUIAutomationLegacyIAccessiblePattern, UIA_LegacyIAccessiblePatternId,
    };

    let pattern: IUIAutomationLegacyIAccessiblePattern =
        match unsafe { element.GetCurrentPatternAs(UIA_LegacyIAccessiblePatternId) } {
            Ok(pattern) => pattern,
            Err(_) => return Ok(None),
        };

    let selected = match unsafe { pattern.GetCurrentSelection() } {
        Ok(selected) => selected,
        Err(_) => {
            let value = unsafe { pattern.CurrentValue().context("failed to read legacy current value")? };
            return Ok(normalize_selection_text(value.to_string()));
        }
    };

    let count = unsafe {
        selected
            .Length()
            .context("failed to get legacy selection count")?
    };
    for index in 0..count {
        let selected_element = unsafe {
            selected
                .GetElement(index)
                .with_context(|| format!("failed to get legacy selected element at index {index}"))?
        };

        if let Ok(Some(text)) = text_from_element(&selected_element) {
            return Ok(Some(text));
        }

        if let Ok(name) = unsafe { selected_element.CurrentName() } {
            if let Some(text) = normalize_selection_text(name.to_string()) {
                return Ok(Some(text));
            }
        }
    }

    let value = unsafe { pattern.CurrentValue().context("failed to read legacy current value")? };
    Ok(normalize_selection_text(value.to_string()))
}

#[cfg(target_os = "windows")]
fn text_from_descendants(
    root: &windows::Win32::UI::Accessibility::IUIAutomationElement,
    condition: &windows::Win32::UI::Accessibility::IUIAutomationCondition,
) -> anyhow::Result<Option<String>> {
    use anyhow::Context;
    use windows::Win32::UI::Accessibility::TreeScope_Descendants;

    let descendants = unsafe {
        root.FindAll(TreeScope_Descendants, condition)
            .context("failed to enumerate descendant elements")?
    };

    let count = unsafe {
        descendants
            .Length()
            .context("failed to get descendant count")?
    };
    for index in 0..count.min(32) {
        let descendant = unsafe {
            descendants
                .GetElement(index)
                .with_context(|| format!("failed to get descendant element at index {index}"))?
        };

        if let Some(text) = text_from_element(&descendant)? {
            return Ok(Some(text));
        }

        if let Some(text) = text_from_legacy_pattern(&descendant)? {
            return Ok(Some(text));
        }
    }

    Ok(None)
}

#[cfg(target_os = "windows")]
fn root_candidates(
    automation: &windows::Win32::UI::Accessibility::IUIAutomation,
    focused: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> anyhow::Result<Vec<windows::Win32::UI::Accessibility::IUIAutomationElement>> {
    use anyhow::Context;

    let mut roots = vec![focused.clone()];
    let walker = unsafe {
        automation
            .ControlViewWalker()
            .context("failed to create UI Automation tree walker")?
    };
    let mut current = focused.clone();

    for _ in 0..4 {
        let parent = match unsafe { walker.GetParentElement(&current) } {
            Ok(parent) => parent,
            Err(_) => break,
        };
        roots.push(parent.clone());
        current = parent;
    }

    Ok(roots)
}

#[cfg(target_os = "windows")]
pub fn capture_selection_text() -> anyhow::Result<Option<String>> {
    use anyhow::Context;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};

    struct ComGuard(bool);
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    let init_hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let _com_guard = if init_hr.is_ok() { ComGuard(true) } else { ComGuard(false) };

    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
            .context("failed to create UI Automation instance")?
    };
    let condition = unsafe {
        automation
            .CreateTrueCondition()
            .context("failed to create UI Automation condition")?
    };
    let focused = unsafe {
        automation
            .GetFocusedElement()
            .context("failed to get focused element")?
    };

    for (index, root) in root_candidates(&automation, &focused)?.into_iter().enumerate() {
        if let Some(text) = text_from_element(&root)? {
            if index > 0 {
                eprintln!("[helper] selection capture: fallback succeeded via ancestor text pattern");
            }
            return Ok(Some(text));
        }

        if let Some(text) = text_from_descendants(&root, &condition)? {
            eprintln!("[helper] selection capture: fallback succeeded via descendant text pattern");
            return Ok(Some(text));
        }

        if let Some(text) = text_from_legacy_pattern(&root)? {
            eprintln!("[helper] selection capture: fallback succeeded via legacy accessibility");
            return Ok(Some(text));
        }
    }

    eprintln!(
        "[helper] selection capture: no text found via focused, ancestor, descendant, or legacy accessibility fallbacks"
    );
    Ok(None)
}

#[cfg(not(target_os = "windows"))]
pub fn capture_selection_text() -> anyhow::Result<Option<String>> {
    Ok(None)
}

#[cfg(target_os = "windows")]
pub fn start_selection_loop(selection_mode: SelectionMode) -> anyhow::Result<()> {
    use std::time::Duration;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

    if selection_mode != SelectionMode::AutoPopup {
        return Ok(());
    }

    let mut last_pressed = false;
    let mut last_text = None;

    loop {
        let is_pressed = unsafe { (GetAsyncKeyState(VK_LBUTTON as i32) & i16::MIN) != 0 };

        if should_probe_selection(last_pressed, is_pressed) {
            let event = next_selection_event(&mut last_text, capture_selection_text()?);
            if let Some(event) = event {
                crate::stdout_ipc::emit(&event)?;
            }
        }

        last_pressed = is_pressed;
        std::thread::sleep(Duration::from_millis(150));
    }
}

#[cfg(not(target_os = "windows"))]
pub fn start_selection_loop(_selection_mode: SelectionMode) -> anyhow::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_selection_text, should_emit_selection_text, should_probe_selection};

    #[test]
    fn normalizes_selected_text() {
        assert_eq!(normalize_selection_text("  hello  ".to_string()).as_deref(), Some("hello"));
        assert_eq!(normalize_selection_text("\u{feff}hello".to_string()).as_deref(), Some("hello"));
        assert_eq!(normalize_selection_text("   ".to_string()), None);
    }

    #[test]
    fn ignores_blank_selection_text() {
        assert!(should_emit_selection_text(Some("   ".to_string())).is_none());
        assert_eq!(
            should_emit_selection_text(Some(" selected ".to_string()))
                .and_then(|event| event.text),
            Some("selected".to_string())
        );
    }

    #[test]
    fn only_probes_after_mouse_release() {
        assert!(should_probe_selection(true, false));
        assert!(!should_probe_selection(false, false));
        assert!(!should_probe_selection(true, true));
    }
}
