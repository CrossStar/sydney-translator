use translator_lib::helper::HelperEvent;

#[test]
fn parses_selection_helper_event_with_text() {
    let line = r#"{"event":"selection_text","text":"hello","source":"selection"}"#;
    let event: HelperEvent = serde_json::from_str(line).expect("expected helper event JSON");

    assert_eq!(event.event, "selection_text");
    assert_eq!(event.text.as_deref(), Some("hello"));
    assert_eq!(event.source.as_deref(), Some("selection"));
}

#[test]
fn parses_hotkey_helper_event_without_text() {
    let line = r#"{"event":"hotkey_trigger","source":"hotkey"}"#;
    let event: HelperEvent = serde_json::from_str(line).expect("expected helper event JSON");

    assert_eq!(event.event, "hotkey_trigger");
    assert_eq!(event.text, None);
    assert_eq!(event.source.as_deref(), Some("hotkey"));
}

