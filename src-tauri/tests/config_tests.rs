use std::sync::Mutex;
#[cfg(not(target_os = "windows"))]
use translator_lib::commands::save_settings_with_api_key;
use translator_lib::state::AppSettings;
use translator_lib::state::{load_settings, save_settings};

static TEST_LOCK: Mutex<()> = Mutex::new(());

fn temp_settings_path(test_name: &str) -> std::path::PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "translator-task5-{}-{}.json",
        test_name,
        std::process::id()
    ));
    path
}

fn clear_test_file(path: &std::path::Path) {
    let _ = std::fs::remove_file(path);
}

#[test]
fn settings_round_trip_keeps_non_secret_fields() {
    let _guard = TEST_LOCK.lock().expect("expected test lock to succeed");
    let path = temp_settings_path("round-trip");
    std::env::set_var("TRANSLATOR_SETTINGS_PATH", &path);
    clear_test_file(&path);

    let settings = AppSettings {
        base_url: "https://example.com/v1".into(),
        model: "gpt-4.1-mini".into(),
        source_language: "auto".into(),
        target_language: "English".into(),
        global_hotkey: "ctrl+shift+t".into(),
        selection_mode: "hotkey".into(),
        ui_language: "en".into(),
        close_button_action: "ask".into(),
        translation_provider: "ai".into(),
        theme_preset: "light".into(),
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
    };

    save_settings(&settings).expect("expected settings to save");
    let saved = load_settings()
        .expect("expected settings to load")
        .expect("expected saved settings to exist");

    assert_eq!(saved, settings);

    let payload = std::fs::read_to_string(&path).expect("expected settings file to exist");
    assert!(!payload.contains("api-key"));
    assert!(!payload.contains("secret"));

    clear_test_file(&path);
    std::env::remove_var("TRANSLATOR_SETTINGS_PATH");
}

#[test]
fn saving_legacy_claude_theme_preset_writes_absolutely_dark() {
    let _guard = TEST_LOCK.lock().expect("expected test lock to succeed");
    let path = temp_settings_path("normalize-claude");
    std::env::set_var("TRANSLATOR_SETTINGS_PATH", &path);
    clear_test_file(&path);

    let settings = AppSettings {
        base_url: "https://example.com/v1".into(),
        model: "gpt-4.1-mini".into(),
        source_language: "auto".into(),
        target_language: "English".into(),
        global_hotkey: "ctrl+shift+t".into(),
        selection_mode: "hotkey".into(),
        ui_language: "en".into(),
        close_button_action: "ask".into(),
        translation_provider: "ai".into(),
        theme_preset: "claude".into(),
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
    };

    save_settings(&settings).expect("expected settings to save");

    let saved = load_settings()
        .expect("expected settings to load")
        .expect("expected saved settings to exist");
    assert_eq!(saved.theme_preset, "absolutely-dark");

    let payload = std::fs::read_to_string(&path).expect("expected settings file to exist");
    assert!(payload.contains("\"theme_preset\": \"absolutely-dark\""));
    assert!(!payload.contains("\"theme_preset\": \"claude\""));

    clear_test_file(&path);
    std::env::remove_var("TRANSLATOR_SETTINGS_PATH");
}

#[test]
#[cfg(not(target_os = "windows"))]
fn failed_secret_save_restores_previous_non_secret_settings() {
    let _guard = TEST_LOCK.lock().expect("expected test lock to succeed");
    let path = temp_settings_path("rollback-existing");
    std::env::set_var("TRANSLATOR_SETTINGS_PATH", &path);
    clear_test_file(&path);

    let original = AppSettings {
        base_url: "https://original.example/v1".into(),
        model: "gpt-4.1-mini".into(),
        source_language: "auto".into(),
        target_language: "English".into(),
        global_hotkey: "ctrl+shift+t".into(),
        selection_mode: "hotkey".into(),
        ui_language: "en".into(),
        close_button_action: "ask".into(),
        translation_provider: "ai".into(),
        theme_preset: "light".into(),
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
    };
    let updated = AppSettings {
        base_url: "https://updated.example/v1".into(),
        model: "gpt-5-mini".into(),
        source_language: "Japanese".into(),
        target_language: "Chinese".into(),
        global_hotkey: "Ctrl+Shift+T".into(),
        selection_mode: "auto-popup".into(),
        ui_language: "zh".into(),
        close_button_action: "hide".into(),
        translation_provider: "ai".into(),
        theme_preset: "absolutely-dark".into(),
        custom_css: ":root { --accent: #c68b5c; }".into(),
        dismissed_update: "".into(),
        proxy_url: "http://127.0.0.1:7890".into(),
        tts_enabled: false,
        tts_provider: "mimo".into(),
        tts_auto_play: false,
        tts_api_endpoint: "https://api.xiaomimimo.com/v1".into(),
        tts_default_voice_id: "".into(),
        tts_voice_profiles: vec![],
    };

    save_settings(&original).expect("expected original settings to save");

    let result = save_settings_with_api_key(updated.clone(), "secret-key".into(), false);

    assert!(result.is_err());

    let restored = load_settings()
        .expect("expected rollback settings to load")
        .expect("expected rollback settings to exist");
    assert_eq!(restored, original);

    clear_test_file(&path);
    std::env::remove_var("TRANSLATOR_SETTINGS_PATH");
}
