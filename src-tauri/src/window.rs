use tauri::Manager;

pub fn show_centered(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available."))?;

    let was_visible = window.is_visible().map_err(|err| err.to_string())?;

    window.show().map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())?;
    // Only force a reload the first time we surface the hidden window in dev.
    // Reloading on every helper-triggered show drops in-flight selection events.
    #[cfg(debug_assertions)]
    if !was_visible {
        window
            .eval("window.location.reload()")
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub fn install_main_window_behavior(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Main window is not available."))?;

    let window_handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_handle.hide();
        }
    });

    Ok(())
}
