#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() -> anyhow::Result<()> {
    let config = windows_helper::config::HelperConfig::from_env();
    let hotkey = config.global_hotkey.clone();
    let selection_mode = config.selection_mode;

    let hotkey_thread = std::thread::spawn(move || {
        if let Err(err) = windows_helper::hotkey::start_hotkey_loop(&hotkey) {
            eprintln!("[helper] hotkey loop stopped: {err}");
            // Emit error event so the frontend can show a warning
            let event = windows_helper::events::HelperEvent::hotkey_error(err.to_string());
            let _ = windows_helper::stdout_ipc::emit(&event);
        }
    });
    let selection_thread = std::thread::spawn(move || {
        windows_helper::selection::start_selection_loop(selection_mode)
    });

    hotkey_thread
        .join()
        .map_err(|_| anyhow::anyhow!("hotkey listener thread panicked"))?;
    selection_thread
        .join()
        .map_err(|_| anyhow::anyhow!("selection listener thread panicked"))??;

    Ok(())
}
