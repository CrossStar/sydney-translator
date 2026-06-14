use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::env;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct VoiceProfileConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub profile_type: String,
    #[serde(default)]
    pub preset_voice_id: String,
    #[serde(default)]
    pub reference_audio_path: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppSettings {
    pub base_url: String,
    pub model: String,
    pub source_language: String,
    pub target_language: String,
    pub global_hotkey: String,
    pub selection_mode: String,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_close_button_action")]
    pub close_button_action: String,
    #[serde(default = "default_translation_provider")]
    pub translation_provider: String,
    #[serde(default = "default_theme_preset")]
    pub theme_preset: String,
    #[serde(default)]
    pub custom_css: String,
    #[serde(default)]
    pub auto_detect_zh_en_direction: bool,
    #[serde(default)]
    pub dismissed_update: String,
    #[serde(default)]
    pub proxy_url: String,
    #[serde(default)]
    pub tts_enabled: bool,
    #[serde(default = "default_tts_provider")]
    pub tts_provider: String,
    #[serde(default)]
    pub tts_auto_play: bool,
    #[serde(default = "default_tts_api_endpoint")]
    pub tts_api_endpoint: String,
    #[serde(default)]
    pub tts_default_voice_id: String,
    #[serde(default)]
    pub tts_voice_profiles: Vec<VoiceProfileConfig>,
}

fn default_close_button_action() -> String {
    "ask".to_string()
}

fn default_ui_language() -> String {
    "en".to_string()
}

fn default_translation_provider() -> String {
    "ai".to_string()
}

fn default_theme_preset() -> String {
    "light".to_string()
}

fn default_tts_api_endpoint() -> String {
    "https://api.xiaomimimo.com/v1".to_string()
}

fn default_tts_provider() -> String {
    "webspeech".to_string()
}

fn normalize_theme_preset(theme_preset: &str) -> String {
    match theme_preset {
        "light" | "dark" | "absolutely-light" | "absolutely-dark" => theme_preset.to_string(),
        "claude" => "absolutely-dark".to_string(),
        _ => default_theme_preset(),
    }
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    settings.theme_preset = normalize_theme_preset(&settings.theme_preset);
    settings
}

#[derive(Debug)]
pub enum SettingsError {
    Io(std::io::Error),
    Serialization(serde_json::Error),
}

impl Display for SettingsError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            SettingsError::Io(error) => write!(f, "{error}"),
            SettingsError::Serialization(error) => write!(f, "{error}"),
        }
    }
}

impl Error for SettingsError {}

impl From<std::io::Error> for SettingsError {
    fn from(value: std::io::Error) -> Self {
        SettingsError::Io(value)
    }
}

impl From<serde_json::Error> for SettingsError {
    fn from(value: serde_json::Error) -> Self {
        SettingsError::Serialization(value)
    }
}

fn settings_path() -> PathBuf {
    if let Ok(path) = env::var("TRANSLATOR_SETTINGS_PATH") {
        return PathBuf::from(path);
    }

    default_settings_path()
}

fn default_settings_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(app_data) = env::var("APPDATA") {
            return PathBuf::from(app_data)
                .join("translator")
                .join("settings.json");
        }
    }

    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join(".config")
            .join("translator")
            .join("settings.json");
    }

    let mut fallback = env::temp_dir();
    let mut hasher = DefaultHasher::new();
    env::current_dir().ok().hash(&mut hasher);
    fallback.push(format!("translator-settings-{}.json", hasher.finish()));
    fallback
}

pub fn save_settings(settings: &AppSettings) -> Result<(), SettingsError> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let normalized = normalize_settings(settings.clone());
    let payload = serde_json::to_vec_pretty(&normalized)?;
    fs::write(path, payload)?;
    Ok(())
}

pub fn load_settings() -> Result<Option<AppSettings>, SettingsError> {
    let path = settings_path();
    if !path.exists() {
        return Ok(None);
    }

    let payload = fs::read(path)?;
    let parsed = serde_json::from_slice(&payload)?;
    Ok(Some(normalize_settings(parsed)))
}

pub fn delete_settings() -> Result<(), SettingsError> {
    let path = settings_path();
    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_settings, normalize_theme_preset, AppSettings};

    fn sample_settings(theme_preset: &str) -> AppSettings {
        AppSettings {
            base_url: "https://example.com/v1".into(),
            model: "gpt-5-mini".into(),
            source_language: "auto".into(),
            target_language: "English".into(),
            global_hotkey: "ctrl+shift+t".into(),
            selection_mode: "hotkey".into(),
            ui_language: "en".into(),
            close_button_action: "ask".into(),
            translation_provider: "ai".into(),
            theme_preset: theme_preset.into(),
            custom_css: "".into(),
            auto_detect_zh_en_direction: false,
            dismissed_update: "".into(),
            proxy_url: "".into(),
            tts_enabled: false,
            tts_provider: "mimo".into(),
            tts_auto_play: false,
            tts_api_endpoint: "https://api.xiaomimimo.com/v1".into(),
            tts_default_voice_id: "".into(),
            tts_voice_profiles: vec![],
        }
    }

    #[test]
    fn normalizes_legacy_claude_theme_preset() {
        assert_eq!(normalize_theme_preset("claude"), "absolutely-dark");
    }

    #[test]
    fn falls_back_to_light_for_unknown_theme_preset() {
        assert_eq!(normalize_theme_preset("mystery-theme"), "light");
    }

    #[test]
    fn normalizes_theme_preset_inside_settings() {
        let settings = normalize_settings(sample_settings("claude"));
        assert_eq!(settings.theme_preset, "absolutely-dark");
    }
}
