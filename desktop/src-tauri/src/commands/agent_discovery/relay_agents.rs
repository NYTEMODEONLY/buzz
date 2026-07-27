use std::collections::{hash_map::Entry, HashMap, HashSet};

use buzz_core_pkg::kind::KIND_MANAGED_AGENT;
use tauri::State;

use crate::{
    app_state::AppState,
    managed_agents::{agent_events::ManagedAgentEventContent, RelayAgentInfo},
    nostr_convert,
    relay::query_relay,
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
    let owner_managed_pubkeys = owner_managed_agents.keys().cloned().collect::<Vec<_>>();

    // The broad directory can hit its result cap before an older canonical
    // managed profile appears. Always fetch the owner's declared agents by
    // author as a second lane, then merge by the newest profile event.
    let owner_managed_directory_events = if owner_managed_pubkeys.is_empty() {
        vec![]
    } else {
        query_relay(
            &state,
            &[serde_json::json!({
                "authors": owner_managed_pubkeys,
                "kinds": [10100],
                "limit": RELAY_AGENT_FETCH_LIMIT,
            })],
        )
        .await?
    };
    let directory_events = latest_directory_events(
        directory_events
            .into_iter()
            .chain(owner_managed_directory_events),
    );
    let retired_coordinates = directory_events
        .iter()
        .map(|event| {
            format!(
                "{KIND_MANAGED_AGENT}:{owner_pubkey}:{}",
                event.pubkey.to_hex()
            )
        })
        .collect::<Vec<_>>();
    let retired_owner_managed_events = if retired_coordinates.is_empty() {
        vec![]
    } else {
        query_relay(
            &state,
            &[serde_json::json!({
                "authors": [owner_pubkey],
                "kinds": [5],
                "#a": retired_coordinates,
                "limit": RELAY_AGENT_FETCH_LIMIT,
            })],
        )
        .await?
    };
    let retired_owner_managed_pubkeys =
        retired_owner_managed_pubkeys(&retired_owner_managed_events, &owner_pubkey);
    let directory_events = active_directory_events(
        directory_events,
        &owner_managed_agents,
        &retired_owner_managed_pubkeys,
    );

    let value = nostr_convert::agents_from_events(&directory_events);
    let agents = value
        .get("agents")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    let mut agents: Vec<RelayAgentInfo> =
        serde_json::from_value(agents).map_err(|e| format!("agent parse failed: {e}"))?;
    for agent in &mut agents {
        if let Some(managed) = owner_managed_agents.get(&agent.pubkey) {
            agent.is_owner_managed = true;
            agent.owner_managed_persona_id = managed.persona_id.clone();
        }
    }
    append_missing_owner_managed_agents(&mut agents, &owner_managed_agents, &owner_pubkey);
    Ok(agents)
}

fn append_missing_owner_managed_agents(
    agents: &mut Vec<RelayAgentInfo>,
    owner_managed_agents: &HashMap<String, ManagedAgentEventContent>,
    owner_pubkey: &str,
) {
    for (pubkey, managed) in owner_managed_agents {
        if agents.iter().any(|agent| agent.pubkey == *pubkey) {
            continue;
        }

        // A kind:30177 coordinate is independently sufficient to identify an
        // owner-managed agent. Its kind:10100 directory profile may be absent,
        // policy-only, or temporarily omitted by relay retention. Preserve
        // the canonical pubkey with the public managed declaration instead of
        // falling back to a same-persona local launch card.
        agents.push(RelayAgentInfo {
            pubkey: pubkey.clone(),
            name: managed.name.clone(),
            avatar_url: None,
            owner_pubkey: Some(owner_pubkey.to_string()),
            is_owner_managed: true,
            owner_managed_persona_id: managed.persona_id.clone(),
            agent_type: "agent".to_string(),
            channels: vec![],
            channel_ids: vec![],
            capabilities: vec![],
            status: "offline".to_string(),
            respond_to: Some(managed.respond_to),
            respond_to_allowlist: managed.respond_to_allowlist.clone(),
        });
    }
}

fn latest_directory_events(events: impl IntoIterator<Item = nostr::Event>) -> Vec<nostr::Event> {
    let mut latest_by_author = HashMap::<String, nostr::Event>::new();
    for event in events {
        let author = event.pubkey.to_hex();
        match latest_by_author.entry(author) {
            Entry::Vacant(entry) => {
                entry.insert(event);
            }
            Entry::Occupied(mut entry) if event.created_at > entry.get().created_at => {
                entry.insert(event);
            }
            Entry::Occupied(_) => {}
        }
    }
    latest_by_author.into_values().collect()
}

fn retired_owner_managed_pubkeys(
    events: &[nostr::Event],
    owner_pubkey: &str,
) -> HashSet<String> {
    events
        .iter()
        .filter(|event| event.kind.as_u16() == 5 && event.pubkey.to_hex() == owner_pubkey)
        .flat_map(|event| event.tags.iter())
        .filter_map(|tag| {
            let values = tag.as_slice();
            if values.first().map(String::as_str) != Some("a") {
                return None;
            }
            let mut coordinate = values.get(1)?.splitn(3, ':');
            if coordinate.next()?.parse::<u32>().ok()? != KIND_MANAGED_AGENT
                || coordinate.next()? != owner_pubkey
            {
                return None;
            }
            nostr::PublicKey::from_hex(coordinate.next()?)
                .ok()
                .map(|pubkey| pubkey.to_hex())
        })
        .collect()
}

fn active_directory_events(
    events: Vec<nostr::Event>,
    owner_managed_agents: &HashMap<String, ManagedAgentEventContent>,
    retired_owner_managed_pubkeys: &HashSet<String>,
) -> Vec<nostr::Event> {
    events
        .into_iter()
        .filter(|event| {
            let pubkey = event.pubkey.to_hex();
            !retired_owner_managed_pubkeys.contains(&pubkey)
                || owner_managed_agents.contains_key(&pubkey)
        })
        .collect()
}

fn owner_managed_agents(
    events: &[nostr::Event],
    owner_pubkey: &str,
) -> HashMap<String, ManagedAgentEventContent> {
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
            let managed =
                crate::managed_agents::agent_events::managed_agent_content_from_event(event)
                    .ok()?;
            Some((pubkey, managed))
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

        assert_eq!(agents.len(), 1);
        assert_eq!(
            agents
                .get(&managed_agent)
                .and_then(|agent| agent.persona_id.as_deref()),
            Some("builtin:fizz")
        );
        assert_eq!(
            agents.get(&managed_agent).map(|agent| agent.name.as_str()),
            Some("MUSE")
        );
    }

    #[test]
    fn missing_directory_profile_still_yields_canonical_managed_agent() {
        let owner = nostr::Keys::generate();
        let canonical = nostr::Keys::generate().public_key().to_hex();
        let managed = ManagedAgentEventContent {
            name: "MUSE".to_string(),
            persona_id: Some("builtin:fizz".to_string()),
            system_prompt: None,
            model: None,
            provider: None,
            persona_source_version: None,
            parallelism: 24,
            respond_to: crate::managed_agents::RespondTo::OwnerOnly,
            respond_to_allowlist: vec![],
        };
        let managed_agents = HashMap::from([(canonical.clone(), managed)]);
        let mut agents = vec![];

        append_missing_owner_managed_agents(
            &mut agents,
            &managed_agents,
            &owner.public_key().to_hex(),
        );

        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].pubkey, canonical);
        assert_eq!(agents[0].name, "MUSE");
        assert!(agents[0].is_owner_managed);
        assert_eq!(
            agents[0].owner_managed_persona_id.as_deref(),
            Some("builtin:fizz")
        );
    }

    #[test]
    fn targeted_directory_profiles_fill_and_refresh_a_capped_broad_result() {
        let canonical = nostr::Keys::generate();
        let other = nostr::Keys::generate();
        let old = nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"Old MUSE"}"#)
            .custom_created_at(nostr::Timestamp::from(100))
            .sign_with_keys(&canonical)
            .unwrap();
        let latest = nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"MUSE"}"#)
            .custom_created_at(nostr::Timestamp::from(200))
            .sign_with_keys(&canonical)
            .unwrap();
        let unrelated = nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"ALICE"}"#)
            .sign_with_keys(&other)
            .unwrap();

        let merged = latest_directory_events([old, unrelated.clone(), latest.clone()]);

        assert_eq!(merged.len(), 2);
        assert!(merged.iter().any(|event| event.id == latest.id));
        assert!(merged.iter().any(|event| event.id == unrelated.id));
    }

    #[test]
    fn owner_coordinate_tombstones_identify_only_exact_retired_agents() {
        let owner = nostr::Keys::generate();
        let other_owner = nostr::Keys::generate();
        let retired = nostr::Keys::generate().public_key().to_hex();
        let protected = nostr::Keys::generate().public_key().to_hex();
        let malformed = nostr::EventBuilder::new(nostr::Kind::Custom(5), "")
            .tags(vec![nostr::Tag::parse(["a", "not-a-coordinate"]).unwrap()])
            .sign_with_keys(&owner)
            .unwrap();
        let foreign = crate::managed_agents::agent_events::build_agent_delete(
            &protected,
            &other_owner.public_key().to_hex(),
        )
        .unwrap()
        .sign_with_keys(&other_owner)
        .unwrap();
        let retired_event = crate::managed_agents::agent_events::build_agent_delete(
            &retired,
            &owner.public_key().to_hex(),
        )
        .unwrap()
        .sign_with_keys(&owner)
        .unwrap();

        let retired_pubkeys = retired_owner_managed_pubkeys(
            &[malformed, foreign, retired_event],
            &owner.public_key().to_hex(),
        );

        assert_eq!(retired_pubkeys, HashSet::from([retired]));
        assert!(!retired_pubkeys.contains(&protected));
    }

    #[test]
    fn retired_directory_profiles_stay_hidden_until_redeclared() {
        let retired = nostr::Keys::generate();
        let alice = nostr::Keys::generate();
        let retired_event =
            nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"Old XENA"}"#)
                .sign_with_keys(&retired)
                .unwrap();
        let alice_event =
            nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"Alice"}"#)
                .sign_with_keys(&alice)
                .unwrap();
        let retired_pubkey = retired.public_key().to_hex();
        let retired_pubkeys = HashSet::from([retired_pubkey.clone()]);

        let without_redeclaration = active_directory_events(
            vec![retired_event.clone(), alice_event.clone()],
            &HashMap::new(),
            &retired_pubkeys,
        );
        assert_eq!(without_redeclaration, vec![alice_event.clone()]);

        let managed = ManagedAgentEventContent {
            name: "XENA".to_string(),
            persona_id: None,
            system_prompt: None,
            model: None,
            provider: None,
            persona_source_version: None,
            parallelism: 1,
            respond_to: crate::managed_agents::RespondTo::OwnerOnly,
            respond_to_allowlist: vec![],
        };
        let after_redeclaration = active_directory_events(
            vec![retired_event.clone(), alice_event.clone()],
            &HashMap::from([(retired_pubkey, managed)]),
            &retired_pubkeys,
        );
        assert_eq!(after_redeclaration, vec![retired_event, alice_event]);
    }
}
