use std::env;
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::SystemTime;

fn main() {
    if let Err(error) = stage_windows_helper_sidecar() {
        panic!("failed to stage windows-helper sidecar: {error}");
    }

    tauri_build::build()
}

fn file_modified(metadata: &fs::Metadata) -> Result<SystemTime, Box<dyn Error>> {
    Ok(metadata.modified()?)
}

fn stage_windows_helper_sidecar() -> Result<(), Box<dyn Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let workspace_dir = manifest_dir
        .parent()
        .ok_or("src-tauri should live under the workspace root")?;
    let helper_dir = workspace_dir.join("windows-helper");
    let helper_manifest = helper_dir.join("Cargo.toml");
    let target_triple = env::var("TARGET")?;
    let profile = env::var("PROFILE")?;
    let cargo_profile = match profile.as_str() {
        "debug" => "dev",
        other => other,
    };

    println!("cargo:rerun-if-changed={}", helper_manifest.display());
    println!("cargo:rerun-if-changed={}", helper_dir.join("src").display());

    let status = Command::new("cargo")
        .arg("build")
        .arg("--manifest-path")
        .arg(&helper_manifest)
        .arg("--bin")
        .arg("windows-helper")
        .arg("--target")
        .arg(&target_triple)
        .arg("--profile")
        .arg(cargo_profile)
        .current_dir(workspace_dir)
        .status()?;

    if !status.success() {
        return Err("windows-helper build failed".into());
    }

    let binary_name = if target_triple.contains("windows") {
        "windows-helper.exe"
    } else {
        "windows-helper"
    };
    let built_binary = helper_dir
        .join("target")
        .join(&target_triple)
        .join(&profile)
        .join(binary_name);
    let staged_name = if target_triple.contains("windows") {
        format!("windows-helper-{target_triple}.exe")
    } else {
        format!("windows-helper-{target_triple}")
    };
    let staged_binary = manifest_dir.join("binaries").join(staged_name);

    if let Some(parent) = staged_binary.parent() {
        fs::create_dir_all(parent)?;
    }

    let should_copy = match (fs::metadata(&built_binary), fs::metadata(&staged_binary)) {
        (Ok(built), Ok(staged)) => file_modified(&built)? > file_modified(&staged)?,
        (Ok(_), Err(_)) => true,
        (Err(error), _) => return Err(error.into()),
    };

    if should_copy {
        fs::copy(&built_binary, &staged_binary)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let mut permissions = fs::metadata(&staged_binary)?.permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&staged_binary, permissions)?;
        }
    }

    Ok(())
}
