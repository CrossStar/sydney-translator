use tauri::Manager;

pub mod app_log;
pub mod commands;
pub mod helper;
pub mod secure_store;
pub mod state;
pub mod tray;
pub mod window;

fn should_show_main_window_on_startup() -> bool {
    let settings = match state::load_settings() {
        Ok(settings) => settings,
        Err(_) => return true,
    };

    let api_key_present = secure_store::has_api_key().unwrap_or(false);
    let Some(settings) = settings else {
        return true;
    };

    settings.base_url.trim().is_empty() || settings.model.trim().is_empty() || !api_key_present
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_log::info("app starting");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            app_log::info("tauri setup started");
            app.manage(helper::HelperProcessState::default());
            window::install_main_window_behavior(app.handle())
                .map_err(Box::<dyn std::error::Error>::from)?;
            tray::build_tray(app.handle())?;
            app_log::info("tray initialized");
            helper::spawn_helper(app.handle().clone()).map_err(|err| {
                let message = format!("failed to start helper sidecar: {err}");
                app_log::error(&message);
                Box::<dyn std::error::Error>::from(message)
            })?;
            app_log::info("helper sidecar initialized");

            let should_show_main_window = should_show_main_window_on_startup();
            app_log::info(format!("startup window visible={should_show_main_window}"));
            if should_show_main_window {
                window::show_centered(app.handle()).map_err(Box::<dyn std::error::Error>::from)?;
            }

            app_log::info("tauri setup completed");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_api_key,
            commands::load_settings,
            commands::reload_helper,
            commands::save_settings_with_api_key,
            commands::show_main_window,
            commands::exit_application,
            commands::set_always_on_top,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
            commands::fetch_models,
            commands::test_connection,
            commands::translate,
            commands::check_for_update,
            commands::save_tts_api_key_command,
            commands::load_tts_api_key,
            commands::synthesize_speech,
            commands::get_log_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
