use crate::selection::{parse_selection_mode, SelectionMode};

pub const DEFAULT_GLOBAL_HOTKEY: &str = "ctrl+shift+t";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HelperConfig {
    pub selection_mode: SelectionMode,
    pub global_hotkey: String,
}

impl Default for HelperConfig {
    fn default() -> Self {
        Self {
            selection_mode: SelectionMode::Hotkey,
            global_hotkey: String::from(DEFAULT_GLOBAL_HOTKEY),
        }
    }
}

impl HelperConfig {
    pub fn from_env() -> Self {
        let selection_mode = std::env::var("TRANSLATOR_SELECTION_MODE")
            .map(|value| parse_selection_mode(&value))
            .unwrap_or(SelectionMode::Hotkey);

        let global_hotkey = std::env::var("TRANSLATOR_GLOBAL_HOTKEY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| String::from(DEFAULT_GLOBAL_HOTKEY));

        Self {
            selection_mode,
            global_hotkey,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::HelperConfig;
    use crate::selection::SelectionMode;

    #[test]
    fn loads_helper_config_from_environment() {
        std::env::set_var("TRANSLATOR_SELECTION_MODE", "auto-popup");
        std::env::set_var("TRANSLATOR_GLOBAL_HOTKEY", "Ctrl+Shift+T");

        let config = HelperConfig::from_env();

        assert_eq!(config.selection_mode, SelectionMode::AutoPopup);
        assert_eq!(config.global_hotkey, "Ctrl+Shift+T");

        std::env::remove_var("TRANSLATOR_SELECTION_MODE");
        std::env::remove_var("TRANSLATOR_GLOBAL_HOTKEY");
    }
}
