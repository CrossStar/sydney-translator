use crate::app_log;
use crate::secure_store;
use crate::state;
use crate::state::AppSettings;
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::ManagerExt;

const MAX_REFERENCE_AUDIO_BYTES: u64 = 25 * 1024 * 1024;

fn resolve_api_key(api_key: String) -> Result<String, String> {
    if !api_key.trim().is_empty() {
        return Ok(api_key);
    }
    secure_store::load_api_key()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No API key stored. Enter one in Settings.".to_string())
}

fn build_client(proxy_url: &str) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    if !proxy_url.trim().is_empty() {
        let proxy = reqwest::Proxy::all(proxy_url).map_err(|e| e.to_string())?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_connection(
    base_url: String,
    api_key: String,
    proxy_url: String,
) -> Result<u64, String> {
    let key = resolve_api_key(api_key)?;
    let base = base_url.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = build_client(&proxy_url)?;
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
pub async fn fetch_models(
    base_url: String,
    api_key: String,
    proxy_url: String,
) -> Result<Vec<String>, String> {
    let key = resolve_api_key(api_key)?;
    let base = base_url.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = build_client(&proxy_url)?;
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
    struct Model {
        id: String,
    }
    #[derive(Deserialize)]
    struct ModelsResponse {
        data: Vec<Model>,
    }
    let body: ModelsResponse = resp.json().await.map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = body.data.into_iter().map(|m| m.id).collect();
    ids.sort();
    Ok(ids)
}

fn to_bing_lang(name: &str) -> &str {
    match name {
        "Chinese" => "zh-Hans",
        "English" => "en",
        "Japanese" => "ja",
        "Korean" => "ko",
        "French" => "fr",
        "German" => "de",
        "Spanish" => "es",
        "Portuguese" => "pt",
        "Russian" => "ru",
        "Arabic" => "ar",
        "Italian" => "it",
        "Dutch" => "nl",
        "Polish" => "pl",
        "Turkish" => "tr",
        "Vietnamese" => "vi",
        "Thai" => "th",
        other => other,
    }
}

fn to_google_lang(name: &str) -> &str {
    match name {
        "Chinese" => "zh-CN",
        "English" => "en",
        "Japanese" => "ja",
        "Korean" => "ko",
        "French" => "fr",
        "German" => "de",
        "Spanish" => "es",
        "Portuguese" => "pt",
        "Russian" => "ru",
        "Arabic" => "ar",
        "Italian" => "it",
        "Dutch" => "nl",
        "Polish" => "pl",
        "Turkish" => "tr",
        "Vietnamese" => "vi",
        "Thai" => "th",
        "auto" => "auto",
        other => other,
    }
}

async fn translate_bing(
    app: &tauri::AppHandle,
    source_language: &str,
    target_language: &str,
    text: &str,
    proxy_url: &str,
) -> Result<(), String> {
    use tauri::Emitter;

    // Step 1: fetch a free auth token from the Bing translator web endpoint
    let token_client = build_client(proxy_url)?;
    let token_resp = token_client
        .get("https://edge.microsoft.com/translate/auth")
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("Bing auth: {e}"))?;

    if !token_resp.status().is_success() {
        return Err(format!("Bing auth HTTP {}", token_resp.status()));
    }
    let token = token_resp.text().await.map_err(|e| e.to_string())?;

    // Step 2: call the translate API with the token
    let to = to_bing_lang(target_language);
    let url = if source_language == "auto" {
        format!("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to={to}")
    } else {
        let from = to_bing_lang(source_language);
        format!("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to={to}&from={from}")
    };

    #[derive(Serialize)]
    struct BingBody {
        #[serde(rename = "Text")]
        text: String,
    }
    #[derive(Deserialize)]
    struct BingTranslation {
        text: String,
    }
    #[derive(Deserialize)]
    struct BingResult {
        translations: Vec<BingTranslation>,
    }

    let client = build_client(proxy_url)?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .json(&[BingBody {
            text: text.to_string(),
        }])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Bing HTTP {status}: {}",
            &body[..body.len().min(200)]
        ));
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
    proxy_url: &str,
) -> Result<(), String> {
    use tauri::Emitter;
    let sl = to_google_lang(source_language);
    let tl = to_google_lang(target_language);
    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={q}",
        q = urlencoding::encode(text)
    );
    let client = build_client(proxy_url)?;
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
    proxy_url: String,
) -> Result<(), String> {
    match provider.as_str() {
        "bing" => {
            return translate_bing(&app, &source_language, &target_language, &text, &proxy_url)
                .await
        }
        "google" => {
            return translate_google(&app, &source_language, &target_language, &text, &proxy_url)
                .await
        }
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
    struct Message {
        role: String,
        content: String,
    }
    #[derive(Serialize)]
    struct ChatRequest {
        model: String,
        messages: Vec<Message>,
        stream: bool,
    }

    let client = build_client(&proxy_url)?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .json(&ChatRequest {
            model,
            messages: vec![Message {
                role: "user".into(),
                content: prompt,
            }],
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
                                .get("choices")
                                .and_then(|c| c.get(0))
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
pub async fn check_for_update(
    current_version: String,
    dismissed_version: String,
) -> Result<CheckUpdateResult, String> {
    #[derive(Deserialize)]
    struct Release {
        tag_name: String,
        html_url: String,
    }

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
        (
            parts.next().unwrap_or(0),
            parts.next().unwrap_or(0),
            parts.next().unwrap_or(0),
        )
    };
    parse(a) > parse(b)
}

#[derive(Serialize)]
pub struct LoadSettingsResponse {
    pub settings: Option<AppSettings>,
    pub api_key_present: bool,
    pub api_key: String,
    pub tts_api_key_present: bool,
    pub tts_api_key: String,
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

fn save_settings_transaction<
    LoadSettings,
    SaveSettings,
    DeleteSettings,
    SaveSecret,
    DeleteSecret,
    HasSecret,
>(
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
    let api_key = secure_store::load_api_key()
        .ok()
        .flatten()
        .unwrap_or_default();
    let tts_api_key_present = secure_store::has_tts_api_key().unwrap_or(false);
    let tts_api_key = secure_store::load_tts_api_key()
        .ok()
        .flatten()
        .unwrap_or_default();

    Ok(LoadSettingsResponse {
        settings,
        api_key_present,
        api_key,
        tts_api_key_present,
        tts_api_key,
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

#[tauri::command]
pub fn get_log_path() -> Result<String, String> {
    Ok(crate::app_log::log_path().display().to_string())
}

#[tauri::command]
pub fn save_tts_api_key_command(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        crate::app_log::info("deleting stored tts api key");
        secure_store::delete_tts_api_key().map_err(|e| e.to_string())
    } else {
        crate::app_log::info("saving stored tts api key");
        secure_store::save_tts_api_key(&api_key).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn load_tts_api_key() -> Result<String, String> {
    Ok(secure_store::load_tts_api_key()
        .map_err(|e| e.to_string())?
        .unwrap_or_default())
}

#[derive(Serialize, Deserialize)]
pub struct VoiceProfileParam {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub profile_type: String,
    #[serde(default)]
    pub preset_voice_id: String,
    #[serde(default)]
    pub reference_audio_path: String,
}

#[tauri::command]
pub async fn synthesize_speech(
    text: String,
    voice_profile: VoiceProfileParam,
    tts_provider: String,
    tts_api_endpoint: String,
    tts_api_key: String,
) -> Result<String, String> {
    crate::app_log::info(format!(
        "tts requested provider={} endpoint={} voice_type={} voice_id={} text_len={}",
        tts_provider,
        tts_api_endpoint.trim_end_matches('/'),
        voice_profile.profile_type,
        if voice_profile.preset_voice_id.is_empty() {
            "<default>"
        } else {
            &voice_profile.preset_voice_id
        },
        text.len()
    ));

    let key = if tts_api_key.trim().is_empty() {
        secure_store::load_tts_api_key()
            .map_err(|e| {
                crate::app_log::error(format!("tts api key load failed: {e}"));
                e.to_string()
            })?
            .ok_or_else(|| {
                crate::app_log::warn("tts api key missing");
                "No TTS API key stored. Enter one in Settings.".to_string()
            })?
    } else {
        tts_api_key
    };

    let result = match tts_provider.as_str() {
        "openai" => synthesize_openai(&text, &voice_profile, &tts_api_endpoint, &key).await,
        _ => synthesize_mimo(&text, &voice_profile, &tts_api_endpoint, &key).await,
    };

    if let Err(error) = &result {
        crate::app_log::error(format!("tts failed provider={tts_provider}: {error}"));
    }

    result
}

async fn synthesize_mimo(
    text: &str,
    voice_profile: &VoiceProfileParam,
    tts_api_endpoint: &str,
    key: &str,
) -> Result<String, String> {
    let endpoint = tts_api_endpoint.trim_end_matches('/');
    let url = format!("{endpoint}/chat/completions");

    let (model, voice_value) = match voice_profile.profile_type.as_str() {
        "clone" => {
            let audio_path = &voice_profile.reference_audio_path;
            if audio_path.is_empty() {
                crate::app_log::warn("tts clone requested without reference audio path");
                return Err("No reference audio path configured for clone voice.".to_string());
            }
            let metadata = std::fs::metadata(audio_path)
                .map_err(|e| format!("Failed to inspect reference audio: {e}"))?;
            let audio_size = metadata.len();
            crate::app_log::info(format!(
                "tts clone reference_audio file={} bytes={audio_size}",
                std::path::Path::new(audio_path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("<unknown>")
            ));
            if audio_size > MAX_REFERENCE_AUDIO_BYTES {
                let message = format!(
                    "Reference audio is too large ({audio_size} bytes). Maximum is {MAX_REFERENCE_AUDIO_BYTES} bytes."
                );
                crate::app_log::warn(format!("tts clone rejected: {message}"));
                return Err(message);
            }
            let audio_bytes = std::fs::read(audio_path)
                .map_err(|e| format!("Failed to read reference audio: {e}"))?;
            let audio_b64 = base64_encode(&audio_bytes);
            let mime = guess_mime_type(audio_path);
            (
                "mimo-v2.5-tts-voiceclone",
                format!("data:{mime};base64,{audio_b64}"),
            )
        }
        _ => {
            let voice_id = if voice_profile.preset_voice_id.is_empty() {
                "mimo_default".to_string()
            } else {
                voice_profile.preset_voice_id.clone()
            };
            ("mimo-v2.5-tts", voice_id)
        }
    };

    #[derive(Serialize)]
    struct AudioConfig {
        format: String,
        voice: String,
    }
    #[derive(Serialize)]
    struct Message {
        role: String,
        content: String,
    }
    #[derive(Serialize)]
    struct TtsRequest {
        model: String,
        messages: Vec<Message>,
        audio: AudioConfig,
    }

    let request = TtsRequest {
        model: model.to_string(),
        messages: vec![Message {
            role: "assistant".into(),
            content: text.to_string(),
        }],
        audio: AudioConfig {
            format: "wav".into(),
            voice: voice_value,
        },
    };

    crate::app_log::info(format!(
        "tts mimo request model={model} endpoint={endpoint}"
    ));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| {
            crate::app_log::error(format!("tts mimo client build failed: {e}"));
            e.to_string()
        })?;

    let resp = client
        .post(&url)
        .header("api-key", key)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            crate::app_log::error(format!("tts mimo request failed: {e}"));
            e.to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let detail = truncate_for_log(&body, 500);
        crate::app_log::error(format!("tts mimo http status={status} body={detail}"));
        return Err(format!("TTS HTTP {status}: {detail}"));
    }

    crate::app_log::info(format!("tts mimo http status={}", resp.status()));

    #[derive(Deserialize)]
    struct AudioData {
        data: String,
    }
    #[derive(Deserialize)]
    struct TtsMessage {
        audio: AudioData,
    }
    #[derive(Deserialize)]
    struct TtsChoice {
        message: TtsMessage,
    }
    #[derive(Deserialize)]
    struct TtsResponse {
        choices: Vec<TtsChoice>,
    }

    let tts_resp: TtsResponse = resp.json().await.map_err(|e| {
        crate::app_log::error(format!("tts mimo response parse failed: {e}"));
        e.to_string()
    })?;
    let audio_b64 = tts_resp
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.audio.data)
        .ok_or_else(|| {
            crate::app_log::error("tts mimo response contained no audio data");
            "TTS API returned no audio data.".to_string()
        })?;

    crate::app_log::info(format!(
        "tts mimo succeeded audio_base64_len={}",
        audio_b64.len()
    ));
    Ok(audio_b64)
}

async fn synthesize_openai(
    text: &str,
    voice_profile: &VoiceProfileParam,
    tts_api_endpoint: &str,
    key: &str,
) -> Result<String, String> {
    let endpoint = tts_api_endpoint.trim_end_matches('/');
    let url = if endpoint.ends_with("/v1") {
        format!("{endpoint}/audio/speech")
    } else {
        format!("{endpoint}/v1/audio/speech")
    };

    let voice_id = if voice_profile.preset_voice_id.is_empty() {
        "alloy".to_string()
    } else {
        voice_profile.preset_voice_id.clone()
    };

    #[derive(Serialize)]
    struct OpenAiTtsRequest {
        model: String,
        voice: String,
        input: String,
        response_format: String,
    }

    crate::app_log::info(format!(
        "tts openai request model=tts-1 url={url} voice={voice_id}"
    ));
    let request = OpenAiTtsRequest {
        model: "tts-1".into(),
        voice: voice_id,
        input: text.to_string(),
        response_format: "wav".into(),
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| {
            crate::app_log::error(format!("tts openai client build failed: {e}"));
            e.to_string()
        })?;

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            crate::app_log::error(format!("tts openai request failed: {e}"));
            e.to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let detail = truncate_for_log(&body, 500);
        crate::app_log::error(format!("tts openai http status={status} body={detail}"));
        return Err(format!("TTS HTTP {status}: {detail}"));
    }

    crate::app_log::info(format!("tts openai http status={}", resp.status()));
    let audio_bytes = resp.bytes().await.map_err(|e| {
        crate::app_log::error(format!("tts openai response read failed: {e}"));
        e.to_string()
    })?;
    crate::app_log::info(format!(
        "tts openai succeeded audio_bytes={}",
        audio_bytes.len()
    ));
    Ok(base64_encode(&audio_bytes))
}

fn truncate_for_log(value: &str, max_len: usize) -> String {
    value.chars().take(max_len).collect()
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn guess_mime_type(path: &str) -> &str {
    let lower = path.to_lowercase();
    if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".ogg") {
        "audio/ogg"
    } else if lower.ends_with(".flac") {
        "audio/flac"
    } else if lower.ends_with(".m4a") {
        "audio/mp4"
    } else {
        "audio/wav"
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
