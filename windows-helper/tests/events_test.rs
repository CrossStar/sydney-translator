use windows_helper::events::HelperEvent;
use windows_helper::hotkey::{
    default_hotkey_registration, parse_hotkey_registration, MOD_CONTROL_MASK, MOD_SHIFT_MASK,
};
use windows_helper::selection::{
    build_selection_event, next_selection_event, parse_selection_mode, should_probe_selection,
    should_emit_selection_text, SelectionMode,
};

#[test]
fn serializes_selection_event_as_json_line() {
    let event = HelperEvent::selection_text("hello".into());
    let line = serde_json::to_string(&event).expect("expected helper event to serialize");

    assert!(line.contains("selection_text"));
    assert!(line.contains("hello"));
}

#[test]
fn ignores_empty_selection_payloads() {
    assert!(should_emit_selection_text(None).is_none());
    assert!(should_emit_selection_text(Some("   ".into())).is_none());
}

#[test]
fn auto_popup_mode_marks_selection_event() {
    let event = build_selection_event("hello".into());

    assert_eq!(event.event, "selection_text");
    assert_eq!(event.text.as_deref(), Some("hello"));
    assert_eq!(event.source, Some("selection"));
}

#[test]
fn default_hotkey_registration_uses_ctrl_shift_t() {
    let registration = default_hotkey_registration();

    assert_eq!(registration.modifiers, MOD_CONTROL_MASK | MOD_SHIFT_MASK);
    assert_eq!(registration.key_code, u32::from(b'T'));
}

#[test]
fn parses_ctrl_shift_letter_hotkey() {
    let registration = parse_hotkey_registration("Ctrl+Shift+T");

    assert_eq!(registration.modifiers, MOD_CONTROL_MASK | MOD_SHIFT_MASK);
    assert_eq!(registration.key_code, u32::from(b'T'));
}

#[test]
fn parses_ctrl_alt_function_hotkey() {
    let registration = parse_hotkey_registration("ctrl+alt+f9");

    assert_eq!(registration.modifiers, MOD_CONTROL_MASK | 0x0001);
    assert_eq!(registration.key_code, 0x70 + 8);
}

#[test]
fn allows_function_key_without_modifier() {
    let registration = parse_hotkey_registration("f10");

    assert_eq!(registration.modifiers, 0);
    assert_eq!(registration.key_code, 0x70 + 9);
}

#[test]
fn parses_space_hotkey() {
    let registration = parse_hotkey_registration("ctrl+space");

    assert_eq!(registration.modifiers, MOD_CONTROL_MASK);
    assert_eq!(registration.key_code, windows_helper::hotkey::VK_SPACE_CODE);
}

#[test]
fn parses_digit_hotkey() {
    let registration = parse_hotkey_registration("ctrl+5");

    assert_eq!(registration.modifiers, MOD_CONTROL_MASK);
    assert_eq!(registration.key_code, u32::from(b'5'));
}

#[test]
fn falls_back_for_unmodified_letter_hotkey() {
    let registration = parse_hotkey_registration("t");

    assert_eq!(registration, default_hotkey_registration());
}

#[test]
fn falls_back_to_default_hotkey_for_invalid_value() {
    let registration = parse_hotkey_registration("Hyper+Space");

    assert_eq!(registration, default_hotkey_registration());
}

#[test]
fn parses_auto_popup_selection_mode() {
    assert_eq!(parse_selection_mode("auto-popup"), SelectionMode::AutoPopup);
    assert_eq!(parse_selection_mode("anything-else"), SelectionMode::Hotkey);
}

#[test]
fn emits_selection_only_when_text_changes() {
    let mut last_text = Some(String::from("hello"));

    assert!(next_selection_event(&mut last_text, Some(String::from("hello"))).is_none());

    let event = next_selection_event(&mut last_text, Some(String::from("world")))
        .expect("expected changed selection text to emit");

    assert_eq!(event.text.as_deref(), Some("world"));
    assert_eq!(last_text.as_deref(), Some("world"));
}

#[test]
fn probes_selection_after_mouse_release() {
    assert!(should_probe_selection(true, false));
    assert!(!should_probe_selection(false, false));
    assert!(!should_probe_selection(true, true));
}

#[test]
fn serializes_hotkey_event_without_text() {
    let event = HelperEvent::hotkey_trigger();
    let line = serde_json::to_string(&event).expect("expected helper event to serialize");

    assert!(line.contains("hotkey_trigger"));
    assert!(line.contains("hotkey"));
}
