use std::error::Error;
use std::fmt::{Display, Formatter};

#[cfg(target_os = "windows")]
const CREDENTIAL_TARGET: &str = "translator.api_key";
#[cfg(target_os = "windows")]
const TTS_CREDENTIAL_TARGET: &str = "translator.tts_api_key";

#[derive(Debug)]
pub enum SecureStoreError {
    UnsupportedPlatform,
    WindowsApi(u32),
    Encoding,
}

#[cfg(target_os = "windows")]
type SecureStoreResult<T> = Result<T, SecureStoreError>;

impl Display for SecureStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            SecureStoreError::UnsupportedPlatform => {
                write!(f, "Secure API key storage is only implemented for Windows.")
            }
            SecureStoreError::WindowsApi(code) => {
                write!(f, "Windows credential storage failed with code {code}.")
            }
            SecureStoreError::Encoding => {
                write!(f, "Failed to encode credential target for Windows storage.")
            }
        }
    }
}

impl Error for SecureStoreError {}

#[cfg(target_os = "windows")]
fn save_secret(target_name: &str, secret_value: &str) -> Result<(), SecureStoreError> {
    use std::ptr;
    use windows_sys::core::PWSTR;
    use windows_sys::Win32::Foundation::{FILETIME, GetLastError};
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target = to_utf16(target_name)?;
    let mut username = to_utf16("translator")?;
    let mut secret = secret_value.as_bytes().to_vec();

    let credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr() as PWSTR,
        Comment: ptr::null_mut(),
        LastWritten: FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        },
        CredentialBlobSize: secret.len() as u32,
        CredentialBlob: secret.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: ptr::null_mut(),
        TargetAlias: ptr::null_mut(),
        UserName: username.as_mut_ptr() as PWSTR,
    };

    let ok = unsafe { CredWriteW(&credential, 0) };
    if ok == 0 {
        return Err(SecureStoreError::WindowsApi(unsafe { GetLastError() }));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn delete_secret(target_name: &str) -> SecureStoreResult<()> {
    use windows_sys::core::PCWSTR;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

    let target = to_utf16(target_name)?;
    let ok = unsafe { CredDeleteW(target.as_ptr() as PCWSTR, CRED_TYPE_GENERIC, 0) };
    if ok == 0 {
        let code = unsafe { GetLastError() };
        if code == 1168 {
            return Ok(());
        }

        return Err(SecureStoreError::WindowsApi(code));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn has_secret(target_name: &str) -> SecureStoreResult<bool> {
    use std::ptr;
    use windows_sys::core::PCWSTR;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target = to_utf16(target_name)?;
    let mut credential_ptr: *mut CREDENTIALW = ptr::null_mut();
    let ok = unsafe {
        CredReadW(
            target.as_ptr() as PCWSTR,
            CRED_TYPE_GENERIC,
            0,
            &mut credential_ptr,
        )
    };

    if ok == 0 {
        let code = unsafe { GetLastError() };
        if code == 1168 {
            return Ok(false);
        }

        return Err(SecureStoreError::WindowsApi(code));
    }

    unsafe { CredFree(credential_ptr.cast()) };
    Ok(true)
}

#[cfg(target_os = "windows")]
fn load_secret(target_name: &str) -> SecureStoreResult<Option<String>> {
    use std::ptr;
    use std::slice;
    use windows_sys::core::PCWSTR;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target = to_utf16(target_name)?;
    let mut credential_ptr: *mut CREDENTIALW = ptr::null_mut();
    let ok = unsafe {
        CredReadW(
            target.as_ptr() as PCWSTR,
            CRED_TYPE_GENERIC,
            0,
            &mut credential_ptr,
        )
    };

    if ok == 0 {
        let code = unsafe { GetLastError() };
        if code == 1168 {
            return Ok(None);
        }

        return Err(SecureStoreError::WindowsApi(code));
    }

    let credential = unsafe { &*credential_ptr };
    let secret = if credential.CredentialBlobSize == 0 {
        Vec::new()
    } else {
        unsafe {
            slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            )
            .to_vec()
        }
    };

    unsafe { CredFree(credential_ptr.cast()) };

    let value = String::from_utf8(secret).map_err(|_| SecureStoreError::Encoding)?;
    Ok(Some(value))
}

#[cfg(target_os = "windows")]
pub fn save_api_key(api_key: &str) -> Result<(), SecureStoreError> {
    save_secret(CREDENTIAL_TARGET, api_key)
}

#[cfg(target_os = "windows")]
pub fn delete_api_key() -> SecureStoreResult<()> {
    delete_secret(CREDENTIAL_TARGET)
}

#[cfg(target_os = "windows")]
pub fn has_api_key() -> SecureStoreResult<bool> {
    has_secret(CREDENTIAL_TARGET)
}

#[cfg(target_os = "windows")]
pub fn load_api_key() -> SecureStoreResult<Option<String>> {
    load_secret(CREDENTIAL_TARGET)
}

#[cfg(target_os = "windows")]
pub fn save_tts_api_key(api_key: &str) -> Result<(), SecureStoreError> {
    save_secret(TTS_CREDENTIAL_TARGET, api_key)
}

#[cfg(target_os = "windows")]
pub fn delete_tts_api_key() -> SecureStoreResult<()> {
    delete_secret(TTS_CREDENTIAL_TARGET)
}

#[cfg(target_os = "windows")]
pub fn has_tts_api_key() -> SecureStoreResult<bool> {
    has_secret(TTS_CREDENTIAL_TARGET)
}

#[cfg(target_os = "windows")]
pub fn load_tts_api_key() -> SecureStoreResult<Option<String>> {
    load_secret(TTS_CREDENTIAL_TARGET)
}

#[cfg(not(target_os = "windows"))]
pub fn save_api_key(_api_key: &str) -> Result<(), SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn delete_api_key() -> Result<(), SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn has_api_key() -> Result<bool, SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn load_api_key() -> Result<Option<String>, SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn save_tts_api_key(_api_key: &str) -> Result<(), SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn delete_tts_api_key() -> Result<(), SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn has_tts_api_key() -> Result<bool, SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(not(target_os = "windows"))]
pub fn load_tts_api_key() -> Result<Option<String>, SecureStoreError> {
    Err(SecureStoreError::UnsupportedPlatform)
}

#[cfg(target_os = "windows")]
fn to_utf16(value: &str) -> Result<Vec<u16>, SecureStoreError> {
    if value.as_bytes().contains(&0) {
        return Err(SecureStoreError::Encoding);
    }

    Ok(value.encode_utf16().chain(std::iter::once(0)).collect())
}
