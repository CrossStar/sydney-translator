pub const MOD_ALT_MASK: u32 = 0x0001;
pub const MOD_CONTROL_MASK: u32 = 0x0002;
pub const MOD_SHIFT_MASK: u32 = 0x0004;
pub const VK_SPACE_CODE: u32 = 0x20;
pub const VK_F1_CODE: u32 = 0x70;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HotkeyRegistration {
    pub id: i32,
    pub modifiers: u32,
    pub key_code: u32,
}

pub fn default_hotkey_registration() -> HotkeyRegistration {
    HotkeyRegistration {
        id: 1,
        modifiers: MOD_CONTROL_MASK | MOD_SHIFT_MASK,
        key_code: u32::from(b'T'),
    }
}

fn parse_function_key(token: &str) -> Option<u32> {
    let number = token.strip_prefix('f')?.parse::<u32>().ok()?;
    if !(1..=12).contains(&number) {
        return None;
    }
    Some(VK_F1_CODE + number - 1)
}

pub fn parse_hotkey_registration(value: &str) -> HotkeyRegistration {
    let mut modifiers = 0u32;
    let mut key_code = None;
    let normalized_segments: Vec<String> = value
        .split('+')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_ascii_lowercase())
        .collect();

    for token in &normalized_segments {
        match token.as_str() {
            "alt" => modifiers |= MOD_ALT_MASK,
            "ctrl" | "control" => modifiers |= MOD_CONTROL_MASK,
            "shift" => modifiers |= MOD_SHIFT_MASK,
            "space" => key_code = Some(VK_SPACE_CODE),
            _ if parse_function_key(token).is_some() => key_code = parse_function_key(token),
            _ if token.len() == 1 => {
                let character = token.as_bytes()[0].to_ascii_uppercase();
                if character.is_ascii_alphanumeric() {
                    key_code = Some(u32::from(character));
                } else {
                    return default_hotkey_registration();
                }
            }
            _ => return default_hotkey_registration(),
        }
    }

    match (modifiers, key_code) {
        (_, Some(code)) if (VK_F1_CODE..=VK_F1_CODE + 11).contains(&code) => HotkeyRegistration {
            id: 1,
            modifiers,
            key_code: code,
        },
        (0, _) | (_, None) => default_hotkey_registration(),
        (next_modifiers, Some(next_key_code)) => HotkeyRegistration {
            id: 1,
            modifiers: next_modifiers,
            key_code: next_key_code,
        },
    }
}

#[cfg(target_os = "windows")]
pub fn start_hotkey_loop(global_hotkey: &str) -> anyhow::Result<()> {
    use crate::events::HelperEvent;
    use crate::selection;
    use crate::stdout_ipc;
    use anyhow::{anyhow, Context};
    use std::mem::MaybeUninit;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, MSG, TranslateMessage, WM_HOTKEY,
    };

    let registration = parse_hotkey_registration(global_hotkey);
    let registered = unsafe {
        RegisterHotKey(
            HWND::default(),
            registration.id,
            registration.modifiers,
            registration.key_code,
        )
    };

    if registered == 0 {
        return Err(anyhow!(format!(
            "failed to register global hotkey: {global_hotkey}"
        )));
    }

    let mut message = MaybeUninit::<MSG>::zeroed();

    loop {
        let result = unsafe { GetMessageW(message.as_mut_ptr(), HWND::default(), 0, 0) };
        if result == -1 {
            unsafe {
                UnregisterHotKey(HWND::default(), registration.id);
            }
            return Err(anyhow!("failed to read Windows message queue"));
        }

        if result == 0 {
            break;
        }

        let message = unsafe { message.assume_init() };
        if message.message == WM_HOTKEY && message.wParam == registration.id as usize {
            let text = get_selected_text::get_selected_text().ok();
            if let Some(text) = selection::should_emit_selection_text(text) {
                stdout_ipc::emit(&text)
                    .context("failed to emit selection helper event")?;
            } else {
                stdout_ipc::emit(&HelperEvent::hotkey_trigger())
                    .context("failed to emit hotkey helper event")?;
            }
        }

        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    unsafe {
        UnregisterHotKey(HWND::default(), registration.id);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn start_hotkey_loop(_global_hotkey: &str) -> anyhow::Result<()> {
    Ok(())
}
