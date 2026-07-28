use crate::managed_agents::{
    custom_harnesses, AcpAvailabilityStatus, AcpRuntimeCatalogEntry, AuthStatus, HarnessSource,
};

/// Write a user-defined harness definition to `<app-data>/custom_harnesses/<id>.json`.
///
/// Validates the definition before touching the filesystem. `original_id`
/// handles renames so the old definition can be removed atomically.
#[tauri::command]
pub async fn save_custom_harness(
    definition: custom_harnesses::HarnessDefinition,
    original_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<AcpRuntimeCatalogEntry, String> {
    use tauri::Manager;

    custom_harnesses::validate_harness_definition_pub(&definition)?;
    custom_harnesses::check_id_collision(&definition.id)?;

    let rename_old_id: Option<String> = original_id.and_then(|oid| {
        let oid = oid.trim().to_string();
        if oid.is_empty() || oid == definition.id {
            None
        } else {
            Some(oid)
        }
    });
    if let Some(ref old_id) = rename_old_id {
        custom_harnesses::check_id_collision(old_id)
            .map_err(|_| format!("original_id {old_id:?} is a built-in and cannot be deleted"))?;
        if !custom_harnesses::is_valid_harness_id_pub(old_id) {
            return Err(format!("invalid original_id {old_id:?}"));
        }
    }

    let custom_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?
        .join("custom_harnesses");
    std::fs::create_dir_all(&custom_dir)
        .map_err(|e| format!("failed to create custom_harnesses dir: {e}"))?;

    custom_harnesses::save_and_warm(&custom_dir, &definition, rename_old_id.as_deref())?;

    let (availability, command_opt, binary_path) =
        match crate::managed_agents::find_command(&definition.command) {
            Some(path) => (
                AcpAvailabilityStatus::Available,
                Some(definition.command.clone()),
                Some(path.display().to_string()),
            ),
            None => (AcpAvailabilityStatus::NotInstalled, None, None),
        };

    let default_args =
        crate::managed_agents::normalize_agent_args(&definition.command, definition.args.clone());

    Ok(AcpRuntimeCatalogEntry {
        id: definition.id,
        label: definition.label,
        avatar_url: String::new(),
        availability,
        command: command_opt,
        binary_path,
        default_args,
        mcp_command: None,
        model_env_var: None,
        provider_env_var: None,
        thinking_env_var: None,
        install_hint: definition.install_hint,
        install_instructions_url: definition.install_instructions_url,
        can_auto_install: false,
        requires_external_cli: false,
        underlying_cli_path: None,
        node_required: false,
        auth_status: AuthStatus::NotApplicable,
        login_hint: None,
        source: HarnessSource::Custom,
        definition_env: definition.env,
    })
}

/// Remove a user-defined harness definition from app data.
#[tauri::command]
pub async fn delete_custom_harness(id: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    custom_harnesses::check_id_collision(&id)
        .map_err(|_| format!("harness {id:?} is a built-in and cannot be deleted"))?;
    if !custom_harnesses::is_valid_harness_id_pub(&id) {
        return Err(format!("invalid harness id {id:?}"));
    }

    let custom_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?
        .join("custom_harnesses");

    custom_harnesses::delete_and_warm(&custom_dir, &id)
}
