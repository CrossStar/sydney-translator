use crate::events::HelperEvent;

pub fn emit(event: &HelperEvent) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string(event)?);
    Ok(())
}
