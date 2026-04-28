use crate::secure_store;
use crate::state;
use crate::state::AppSettings;
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::ManagerExt;

fn resolve_api_key(api_key: String) -> Result<String, String> {
    if !api_key.trim().is_empty() {
        return Ok(api_key);
    }
    secure_store::load_api_key()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No API key stored. Enter one in Settings.".to_string())
}

#[tauri::command]
pub async fn test_connection(base_url: String, api_key: String) -> Result<u64, String> {
    let key = resolve_api_key(api_key)?;
    let base = base_url.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {key}"))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let elapsed = start.elapsed().as_millis() as u64;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    Ok(elapsed)
}

#[tauri::command]
pub async fn fetch_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let key = resolve_api_key(api_key)?;
    let base = base_url.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    #[derive(Deserialize)]
    struct Model { id: String }
    #[derive(Deserialize)]
    struct ModelsResponse { data: Vec<Model> }
    let body: ModelsResponse = resp.json().await.map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = body.data.into_iter().map(|m| m.id).collect();
    ids.sort();
    Ok(ids)
}

async fn translate_bing(
    app: &tauri::AppHandle,
    source_language: &str,
    target_language: &str,
    text: &str,
) -> Result<(), String> {
    use tauri::Emitter;
    let from = if source_language == "auto" { "" } else { source_language };
    let url = format!(
        "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to={target_language}&from={from}"
    );
    #[derive(Serialize)]
    struct BingBody { #[serde(rename = "Text")] text: String }
    #[derive(Deserialize)]
    struct BingTranslation { text: String }
    #[derive(Deserialize)]
    struct BingResult { translations: Vec<BingTranslation> }

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&[BingBody { text: text.to_string() }])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Bing HTTP {status}: {}", &body[..body.len().min(200)]));
    }

    let results: Vec<BingResult> = resp.json().await.map_err(|e| e.to_string())?;
    let translated = results
        .into_iter()
        .next()
        .and_then(|r| r.translations.into_iter().next())
        .map(|t| t.text)
        .unwrap_or_default();

    let _ = app.emit("translation-chunk", translated);
    Ok(())
}

async fn translate_google(
    app: &tauri::AppHandle,
    source_language: &str,
    target_language: &str,
    text: &str,
) -> Result<(), String> {
    use tauri::Emitter;
    let sl = if source_language == "auto" { "auto" } else { source_language };
    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={target_language}&dt=t&q={q}",
        q = urlencoding::encode(text)
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Google HTTP {}", resp.status()));
    }

    let raw: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut result = String::new();
    if let Some(outer) = raw.get(0).and_then(|v| v.as_array()) {
        for segment in outer {
            if let Some(s) = segment.get(0).and_then(|v| v.as_str()) {
                result.push_str(s);
            }
        }
    }

    let _ = app.emit("translation-chunk", result);
    Ok(())
}

#[tauri::command]
pub async fn translate(
    app: tauri::AppHandle,
    base_url: String,
    api_key: String,
    model: String,
    source_language: String,
    target_language: String,
    text: String,
    provider: String,
) -> Result<(), String> {
    match provider.as_str() {
        "bing" => return translate_bing(&app, &source_language, &target_language, &text).await,
        "google" => return translate_google(&app, &source_language, &target_language, &text).await,
        _ => {}
    }

    use futures_util::StreamExt;
    use tauri::Emitter;

    let key = resolve_api_key(api_key)?;
    let base = base_url.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{base}/chat/completions")
    } else {
        format!("{base}/v1/chat/completions")
    };
    let prompt = format!(
        "Translate the following text from {source_language} to {target_language}. \
         Output only the translation, no explanations.\n\n{text}"
    );
    #[derive(Serialize)]
    struct Message { role: String, content: String }
    #[derive(Serialize)]
    struct ChatRequest { model: String, messages: Vec<Message>, stream: bool }

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .json(&ChatRequest {
            model,
            messages: vec![Message { role: "user".into(), content: prompt }],
            stream: true,
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {}", &body[..body.len().min(200)]));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        loop {
            match buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = buf[..pos].trim_end_matches('\r').to_string();
                    buf = buf[pos + 1..].to_string();

                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            return Ok(());
                        }
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(content) = val
                                .get("choices").and_then(|c| c.get(0))
                                .and_then(|c| c.get("delta"))
                                .and_then(|d| d.get("content"))
                                .and_then(|c| c.as_str())
                            {
                                if !content.is_empty() {
                                    let _ = app.emit("translation-chunk", content.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[derive(Serialize)]
pub struct CheckUpdateResult {
    pub latest_version: String,
    pub release_url: String,
    pub has_update: bool,
}

#[tauri::command]
pub async fn check_for_update(current_version: String, dismissed_version: String) -> Result<CheckUpdateResult, String> {
    #[derive(Deserialize)]
    struct Release { tag_name: String, html_url: String }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/CrossStar/sydney-translator/releases/latest")
        .header("User-Agent", "sydney-translator")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let release: Release = resp.json().await.map_err(|e| e.to_string())?;
    let latest = release.tag_name.trim_start_matches('v').to_string();
    let current = current_version.trim_start_matches('v').to_string();
    let dismissed = dismissed_version.trim_start_matches('v').to_string();

    let has_update = latest != current && latest != dismissed && semver_gt(&latest, &current);

    Ok(CheckUpdateResult {
        latest_version: latest,
        release_url: release.html_url,
        has_update,
    })
}

fn semver_gt(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> (u64, u64, u64) {
        let mut parts = s.splitn(3, '.').map(|p| p.parse::<u64>().unwrap_or(0));
        (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0))
    };
    parse(a) > parse(b)
}

#[derive(Serialize)]
pub struct LoadSettingsResponse {
    pub settings: Option<AppSettings>,
    pub api_key_present: bool,
}

#[derive(Serialize)]
pub struct SaveSettingsResponse {
    pub settings: AppSettings,
    pub api_key_present: bool,
}

#[tauri::command]
pub fn load_api_key() -> Result<Option<String>, String> {
    secure_store::load_api_key().map_err(|err| err.to_string())
}

fn save_settings_transaction<LoadSettings, SaveSettings, DeleteSettings, SaveSecret, DeleteSecret, HasSecret>(
    settings: &AppSettings,
    api_key: &str,
    clear_api_key: bool,
    mut load_previous_settings: LoadSettings,
    mut save_settings: SaveSettings,
    mut delete_settings: DeleteSettings,
    mut save_secret: SaveSecret,
    mut delete_secret: DeleteSecret,
    mut has_secret: HasSecret,
) -> Result<bool, String>
where
    LoadSettings: FnMut() -> Result<Option<AppSettings>, String>,
    SaveSettings: FnMut(&AppSettings) -> Result<(), String>,
    DeleteSettings: FnMut() -> Result<(), String>,
    SaveSecret: FnMut(&str) -> Result<(), String>,
    DeleteSecret: FnMut() -> Result<(), String>,
    HasSecret: FnMut() -> Result<bool, String>,
{
    let previous_settings = load_previous_settings()?;

    save_settings(settings)?;

    let secret_result = if clear_api_key {
        delete_secret().map(|_| false)
    } else if !api_key.trim().is_empty() {
        save_secret(api_key).map(|_| true)
    } else {
        Ok(has_secret().unwrap_or(false))
    };

    match secret_result {
        Ok(api_key_present) => Ok(api_key_present),
        Err(secret_error) => {
            let rollback_result = match previous_settings {
                Some(previous) => save_settings(&previous),
                None => delete_settings(),
            };

            match rollback_result {
                Ok(()) => Err(secret_error),
                Err(rollback_error) => Err(format!(
                    "{secret_error}; failed to restore previous settings: {rollback_error}"
                )),
            }
        }
    }
}

#[tauri::command]
pub fn load_settings() -> Result<LoadSettingsResponse, String> {
    let settings = state::load_settings().map_err(|err| err.to_string())?;
    let api_key_present = secure_store::has_api_key().unwrap_or(false);

    Ok(LoadSettingsResponse {
        settings,
        api_key_present,
    })
}

#[tauri::command]
pub fn save_settings_with_api_key(
    settings: AppSettings,
    api_key: String,
    clear_api_key: bool,
) -> Result<SaveSettingsResponse, String> {
    let api_key_present = save_settings_transaction(
        &settings,
        &api_key,
        clear_api_key,
        || state::load_settings().map_err(|err| err.to_string()),
        |next_settings| state::save_settings(next_settings).map_err(|err| err.to_string()),
        || state::delete_settings().map_err(|err| err.to_string()),
        |secret| secure_store::save_api_key(secret).map_err(|err| err.to_string()),
        || secure_store::delete_api_key().map_err(|err| err.to_string()),
        || secure_store::has_api_key().map_err(|err| err.to_string()),
    )?;

    Ok(SaveSettingsResponse {
        settings,
        api_key_present,
    })
}

#[tauri::command]
pub fn reload_helper(app: tauri::AppHandle) -> Result<(), String> {
    crate::helper::restart_helper(app)
}

#[tauri::command]
pub fn set_always_on_top(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    use tauri::Manager;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window not found."))?;
    window.set_always_on_top(enable).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::window::show_centered(&app)
}

#[tauri::command]
pub fn exit_application(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart_enabled(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    let mgr = app.autolaunch();
    if enable {
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::save_settings_transaction;
    use crate::state::AppSettings;
    use std::cell::RefCell;

    fn sample_settings(base_url: &str) -> AppSettings {
        AppSettings {
            base_url: base_url.into(),
            model: "gpt-5-mini".into(),
            source_language: "auto".into(),
            target_language: "English".into(),
            global_hotkey: "ctrl+shift+t".into(),
            selection_mode: "hotkey".into(),
            ui_language: "en".into(),
            close_button_action: "ask".into(),
            translation_provider: "ai".into(),
            dismissed_update: "".into(),
        }
    }

    #[test]
    fn rolls_back_settings_when_secret_save_fails() {
        let original = sample_settings("https://original.example/v1");
        let updated = sample_settings("https://updated.example/v1");
        let stored_settings = RefCell::new(Some(original.clone()));

        let result = save_settings_transaction(
            &updated,
            "secret-key",
            false,
            || Ok(stored_settings.borrow().clone()),
            |next_settings| {
                *stored_settings.borrow_mut() = Some(next_settings.clone());
                Ok(())
            },
            || {
                *stored_settings.borrow_mut() = None;
                Ok(())
            },
            |_| Err("secret save failed".into()),
            || Ok(()),
            || Ok(false),
        );

        assert_eq!(result, Err(String::from("secret save failed")));
        assert_eq!(*stored_settings.borrow(), Some(original));
    }

    #[test]
    fn semver_gt_works() {
        assert!(super::semver_gt("0.2.0", "0.1.0"));
        assert!(super::semver_gt("1.0.0", "0.9.9"));
        assert!(!super::semver_gt("0.1.0", "0.1.0"));
        assert!(!super::semver_gt("0.0.9", "0.1.0"));
    }
}
