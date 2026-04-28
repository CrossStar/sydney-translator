use crate::commands;
use tauri::menu::{MenuBuilder, MenuEvent};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::{AppHandle, Wry};

const OPEN_ID: &str = "open";
const SETTINGS_ID: &str = "settings";
const QUIT_ID: &str = "quit";

pub fn build_tray(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(OPEN_ID, "Open Translator")
        .text(SETTINGS_ID, "Open Settings")
        .separator()
        .text(QUIT_ID, "Exit")
        .build()?;

    TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Translator")
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event)
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle<Wry>, event: MenuEvent) {
    match event.id().as_ref() {
        OPEN_ID => {
            let _ = commands::show_main_window(app.clone());
        }
        SETTINGS_ID => {
            let _ = commands::show_main_window(app.clone());
            let _ = app.emit("open-settings", ());
        }
        QUIT_ID => app.exit(0),
        _ => {}
    }
}

fn handle_tray_event(tray: &tauri::tray::TrayIcon<Wry>, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let _ = commands::show_main_window(tray.app_handle().clone());
    }
}
