use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct HelperEvent {
    pub event: &'static str,
    pub text: Option<String>,
    pub source: Option<&'static str>,
}

impl HelperEvent {
    pub fn hotkey_trigger() -> Self {
        Self {
            event: "hotkey_trigger",
            text: None,
            source: Some("hotkey"),
        }
    }

    pub fn selection_text(text: String) -> Self {
        Self {
            event: "selection_text",
            text: Some(text),
            source: Some("selection"),
        }
    }

    pub fn hotkey_error(message: String) -> Self {
        Self {
            event: "hotkey_error",
            text: Some(message),
            source: None,
        }
    }
}
