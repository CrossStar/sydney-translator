use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

pub fn log_path() -> PathBuf {
    if let Ok(path) = env::var("TRANSLATOR_LOG_PATH") {
        return PathBuf::from(path);
    }

    default_log_path()
}

fn default_log_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(app_data) = env::var("APPDATA") {
            return PathBuf::from(app_data)
                .join("translator")
                .join("logs")
                .join("app.log");
        }
    }

    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join(".config")
            .join("translator")
            .join("logs")
            .join("app.log");
    }

    env::temp_dir().join("translator-app.log")
}

pub fn info(message: impl AsRef<str>) {
    write_log("INFO", message.as_ref());
}

pub fn warn(message: impl AsRef<str>) {
    write_log("WARN", message.as_ref());
}

pub fn error(message: impl AsRef<str>) {
    write_log("ERROR", message.as_ref());
}

fn write_log(level: &str, message: &str) {
    let path = log_path();
    let Some(parent) = path.parent() else {
        return;
    };

    if fs::create_dir_all(parent).is_err() {
        return;
    }

    rotate_if_needed(&path);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) else {
        return;
    };

    let _ = writeln!(file, "[{timestamp}][{level}] {message}");
}

fn rotate_if_needed(path: &PathBuf) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };

    if metadata.len() < MAX_LOG_BYTES {
        return;
    }

    let backup = path.with_extension("log.bak");
    let _ = fs::remove_file(&backup);
    let _ = fs::rename(path, backup);
}

#[cfg(test)]
mod tests {
    use super::{info, log_path};

    #[test]
    fn writes_log_to_env_override_path() {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "translator-test-log-{}-{}.log",
            std::process::id(),
            "write"
        ));
        let _ = std::fs::remove_file(&path);

        std::env::set_var("TRANSLATOR_LOG_PATH", &path);
        info("test log entry");

        let payload = std::fs::read_to_string(&path).expect("expected log file to be written");
        assert!(payload.contains("[INFO] test log entry"));
        assert_eq!(log_path(), path);

        let _ = std::fs::remove_file(&path);
        std::env::remove_var("TRANSLATOR_LOG_PATH");
    }
}
