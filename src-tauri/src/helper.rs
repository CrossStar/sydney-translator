use serde::{Deserialize, Serialize};
use std::error::Error;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct HelperEvent {
    pub event: String,
    pub text: Option<String>,
    pub source: Option<String>,
}

#[derive(Default)]
pub struct HelperProcessState {
    child: Mutex<Option<CommandChild>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct HelperConfig {
    selection_mode: String,
    global_hotkey: String,
}

impl Default for HelperConfig {
    fn default() -> Self {
        Self {
            selection_mode: String::from("hotkey"),
            global_hotkey: String::from("ctrl+shift+t"),
        }
    }
}

impl HelperConfig {
    fn from_settings(settings: Option<crate::state::AppSettings>) -> Self {
        let Some(settings) = settings else {
            return Self::default();
        };

        Self {
            selection_mode: if settings.selection_mode.trim().is_empty() {
                String::from("hotkey")
            } else {
                settings.selection_mode
            },
            global_hotkey: if settings.global_hotkey.trim().is_empty() {
                String::from("ctrl+shift+t")
            } else {
                settings.global_hotkey
            },
        }
    }
}

pub fn spawn_helper(app: tauri::AppHandle) -> Result<(), Box<dyn Error>> {
    let config = load_helper_config()?;
    spawn_helper_with_config(app, config)
}

pub fn restart_helper(app: tauri::AppHandle) -> Result<(), String> {
    stop_helper(&app);
    let config = load_helper_config().map_err(|err| err.to_string())?;
    spawn_helper_with_config(app, config).map_err(|err| err.to_string())
}

fn load_helper_config() -> Result<HelperConfig, Box<dyn Error>> {
    let settings = crate::state::load_settings()?;
    Ok(HelperConfig::from_settings(settings))
}

fn spawn_helper_with_config(
    app: tauri::AppHandle,
    config: HelperConfig,
) -> Result<(), Box<dyn Error>> {
    let command = app
        .shell()
        .sidecar("windows-helper")?
        .env("TRANSLATOR_SELECTION_MODE", &config.selection_mode)
        .env("TRANSLATOR_GLOBAL_HOTKEY", &config.global_hotkey);

    let (mut rx, child) = command.spawn()?;
    replace_child(&app, child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    if let Ok(parsed) = serde_json::from_slice::<HelperEvent>(&line) {
                        if matches!(parsed.event.as_str(), "hotkey_trigger" | "selection_text") {
                            let _ = crate::window::show_centered(&app);
                        }
                        let _ = app.emit("helper-event", parsed);
                    }
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[helper] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn replace_child(app: &tauri::AppHandle, child: CommandChild) {
    let state = app.state::<HelperProcessState>();
    let mut lock = state.child.lock().expect("helper child state poisoned");
    *lock = Some(child);
}

fn stop_helper(app: &tauri::AppHandle) {
    let state = app.state::<HelperProcessState>();
    let child = state
        .child
        .lock()
        .expect("helper child state poisoned")
        .take();

    if let Some(child) = child {
        let _ = child.kill();
    }
}
