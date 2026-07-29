use super::{BackendKind, ManagedAgentRecord, RelayMeshConfig, TeamRecord};

pub(crate) fn normalize_relay_mesh(
    config: Option<&RelayMeshConfig>,
    backend: &BackendKind,
) -> Result<Option<RelayMeshConfig>, String> {
    let Some(config) = config else {
        return Ok(None);
    };

    let model_ref = config.model_ref.trim();
    if model_ref.is_empty() {
        return Err("Buzz shared compute model is required".to_string());
    }
    if backend != &BackendKind::Local {
        return Err("Buzz shared compute agents must use the local backend".to_string());
    }

    Ok(Some(RelayMeshConfig {
        model_ref: model_ref.to_string(),
    }))
}

pub(crate) fn trim_to_optional_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn ensure_personal_persona_identity_is_available(
    records: &[ManagedAgentRecord],
    persona_id: Option<&str>,
    requested_team_id: Option<&str>,
) -> Result<(), String> {
    // Explicit team deployments are the upstream multi-instance scope. A
    // normal library Start has no requested team and must reuse the existing
    // exact identity instead of minting a sibling for the same persona.
    if requested_team_id.is_some() {
        return Ok(());
    }
    let Some(persona_id) = persona_id else {
        return Ok(());
    };
    let Some(existing) = records.iter().find(|record| {
        !record.pubkey.is_empty() && record.persona_id.as_deref() == Some(persona_id)
    }) else {
        return Ok(());
    };

    Err(format!(
        "persona {persona_id} is already linked to agent {}; reuse that exact identity instead of creating a duplicate",
        existing.pubkey
    ))
}

pub(crate) fn ensure_team_deployment_matches_persona(
    teams: &[TeamRecord],
    persona_id: Option<&str>,
    requested_team_id: Option<&str>,
) -> Result<(), String> {
    let Some(team_id) = requested_team_id else {
        return Ok(());
    };
    let persona_id =
        persona_id.ok_or_else(|| format!("team {team_id} deployment requires a persona"))?;
    let team = teams
        .iter()
        .find(|team| team.id == team_id)
        .ok_or_else(|| format!("team {team_id} not found"))?;
    if !team.persona_ids.iter().any(|id| id == persona_id) {
        return Err(format!(
            "persona {persona_id} does not belong to team {team_id}"
        ));
    }
    Ok(())
}
