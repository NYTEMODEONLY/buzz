use std::collections::HashMap;

use buzz_core_pkg::kind::KIND_MANAGED_AGENT;
use tauri::State;

use crate::{
    app_state::AppState, managed_agents::RelayAgentInfo, nostr_convert, relay::query_relay,
};

const RELAY_AGENT_FETCH_LIMIT: usize = 500;

#[tauri::command]
pub async fn list_relay_agents(state: State<'_, AppState>) -> Result<Vec<RelayAgentInfo>, String> {
    let owner_pubkey = state
        .keys
        .lock()
        .map_err(|error| error.to_string())?
        .public_key()
        .to_hex();

    // A side-by-side Canary deliberately has isolated local secrets. Query the
    // current owner's durable managed-agent coordinates with the directory so
    // agents managed by another Buzz install remain identifiable as managed
    // elsewhere, including their public persona coordinate.
    //
    // Keep these as separately bounded requests. A combined unbounded query
    // can hit the relay's aggregate result cap and silently drop the oldest
    // managed coordinate while still returning a successful response.
    let directory_filter = [serde_json::json!({
        "kinds": [10100],
        "limit": RELAY_AGENT_FETCH_LIMIT,
    })];
    let owner_managed_filter = [serde_json::json!({
        "authors": [owner_pubkey],
        "kinds": [KIND_MANAGED_AGENT],
        "limit": RELAY_AGENT_FETCH_LIMIT,
    })];
    let (directory_events, owner_managed_events) = tokio::try_join!(
        query_relay(&state, &directory_filter),
        query_relay(&state, &owner_managed_filter),
    )?;
    let owner_managed_agents = owner_managed_agents(&owner_managed_events, &owner_pubkey);

    let value = nostr_convert::agents_from_events(&directory_events);
    let agents = value
        .get("agents")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    let mut agents: Vec<RelayAgentInfo> =
        serde_json::from_value(agents).map_err(|e| format!("agent parse failed: {e}"))?;
    for agent in &mut agents {
        if let Some(persona_id) = owner_managed_agents.get(&agent.pubkey) {
            agent.is_owner_managed = true;
            agent.owner_managed_persona_id = persona_id.clone();
        }
    }
    Ok(agents)
}

fn owner_managed_agents(
    events: &[nostr::Event],
    owner_pubkey: &str,
) -> HashMap<String, Option<String>> {
    events
        .iter()
        .filter(|event| {
            event.kind.as_u16() as u32 == KIND_MANAGED_AGENT
                && event.pubkey.to_hex() == owner_pubkey
        })
        .filter_map(|event| {
            let pubkey = event.tags.iter().find_map(|tag| {
                let values = tag.as_slice();
                if values.first().map(|value| value.as_str()) != Some("d") {
                    return None;
                }
                let pubkey = values.get(1)?.as_str();
                nostr::PublicKey::from_hex(pubkey)
                    .ok()
                    .map(|parsed| parsed.to_hex())
            })?;
            let persona_id =
                crate::managed_agents::agent_events::managed_agent_content_from_event(event)
                    .ok()
                .and_then(|content| content.persona_id);
            Some((pubkey, persona_id))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_managed_pubkeys_use_owner_authored_valid_coordinates() {
        let owner = nostr::Keys::generate();
        let other_owner = nostr::Keys::generate();
        let managed_agent = nostr::Keys::generate().public_key().to_hex();
        let foreign_agent = nostr::Keys::generate().public_key().to_hex();

        let managed = nostr::EventBuilder::new(
            nostr::Kind::Custom(KIND_MANAGED_AGENT as u16),
            r#"{"name":"MUSE","persona_id":"builtin:fizz","parallelism":1,"respond_to":"owner-only"}"#,
        )
        .tags(vec![
            nostr::Tag::parse(["d", managed_agent.as_str()]).unwrap()
        ])
        .sign_with_keys(&owner)
        .unwrap();
        let foreign =
            nostr::EventBuilder::new(nostr::Kind::Custom(KIND_MANAGED_AGENT as u16), "{}")
                .tags(vec![
                    nostr::Tag::parse(["d", foreign_agent.as_str()]).unwrap()
                ])
                .sign_with_keys(&other_owner)
                .unwrap();
        let malformed =
            nostr::EventBuilder::new(nostr::Kind::Custom(KIND_MANAGED_AGENT as u16), "{}")
                .tags(vec![nostr::Tag::parse(["d", "not-a-pubkey"]).unwrap()])
                .sign_with_keys(&owner)
                .unwrap();

        let agents =
            owner_managed_agents(&[managed, foreign, malformed], &owner.public_key().to_hex());

        assert_eq!(
            agents,
            HashMap::from([(managed_agent, Some("builtin:fizz".to_string()))])
        );
    }
}
