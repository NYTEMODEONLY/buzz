use std::collections::{hash_map::Entry, HashMap, HashSet};

use buzz_core_pkg::kind::KIND_MANAGED_AGENT;

use crate::managed_agents::{agent_events::ManagedAgentEventContent, RelayAgentInfo};

pub(super) fn append_missing_owner_managed_agents(
    agents: &mut Vec<RelayAgentInfo>,
    owner_managed_agents: &HashMap<String, ManagedAgentEventContent>,
) {
    for (pubkey, managed) in owner_managed_agents {
        if agents.iter().any(|agent| agent.pubkey == *pubkey) {
            continue;
        }

        // A live owner-authored kind:30177 coordinate is independently
        // sufficient to preserve the canonical identity when kind:10100 is
        // absent, policy-only, or omitted by relay retention.
        agents.push(RelayAgentInfo {
            pubkey: pubkey.clone(),
            name: managed.name.clone(),
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

pub(super) fn latest_directory_events(
    events: impl IntoIterator<Item = nostr::Event>,
) -> Vec<nostr::Event> {
    let mut latest_by_author = HashMap::<String, nostr::Event>::new();
    for event in events {
        let author = event.pubkey.to_hex();
        match latest_by_author.entry(author) {
            Entry::Vacant(entry) => {
                entry.insert(event);
            }
            Entry::Occupied(mut entry) if event_is_newer(&event, entry.get()) => {
                entry.insert(event);
            }
            Entry::Occupied(_) => {}
        }
    }
    latest_by_author.into_values().collect()
}

fn event_is_newer(candidate: &nostr::Event, current: &nostr::Event) -> bool {
    candidate.created_at > current.created_at
        || (candidate.created_at == current.created_at
            && candidate.id.to_hex() > current.id.to_hex())
}

pub(super) fn retired_owner_managed_pubkeys(
    events: &[nostr::Event],
    owner_pubkey: &str,
    owner_managed_versions: &HashMap<String, nostr::Event>,
) -> HashSet<String> {
    let mut latest_deletion_by_pubkey = HashMap::<String, &nostr::Event>::new();
    for event in events
        .iter()
        .filter(|event| event.kind.as_u16() == 5 && event.pubkey.to_hex() == owner_pubkey)
    {
        for tag in event.tags.iter() {
            let values = tag.as_slice();
            if values.first().map(String::as_str) != Some("a") {
                continue;
            }
            let Some(coordinate_value) = values.get(1) else {
                continue;
            };
            let mut coordinate = coordinate_value.splitn(3, ':');
            if coordinate
                .next()
                .and_then(|value| value.parse::<u32>().ok())
                != Some(KIND_MANAGED_AGENT)
                || coordinate.next() != Some(owner_pubkey)
            {
                continue;
            }
            let Some(raw_pubkey) = coordinate.next() else {
                continue;
            };
            let Ok(pubkey) = nostr::PublicKey::from_hex(raw_pubkey) else {
                continue;
            };
            let pubkey = pubkey.to_hex();
            match latest_deletion_by_pubkey.entry(pubkey) {
                Entry::Vacant(entry) => {
                    entry.insert(event);
                }
                Entry::Occupied(mut entry) if event_is_newer(event, entry.get()) => {
                    entry.insert(event);
                }
                Entry::Occupied(_) => {}
            }
        }
    }

    latest_deletion_by_pubkey
        .into_iter()
        .filter_map(|(pubkey, deletion)| {
            let restored = owner_managed_versions
                .get(&pubkey)
                .is_some_and(|declaration| event_is_newer(declaration, deletion));
            (!restored).then_some(pubkey)
        })
        .collect()
}

pub(super) fn active_directory_events(
    events: Vec<nostr::Event>,
    retired_owner_managed_pubkeys: &HashSet<String>,
) -> Vec<nostr::Event> {
    events
        .into_iter()
        .filter(|event| !retired_owner_managed_pubkeys.contains(&event.pubkey.to_hex()))
        .collect()
}

fn latest_owner_managed_events(
    events: &[nostr::Event],
    owner_pubkey: &str,
) -> HashMap<String, nostr::Event> {
    let mut latest_by_pubkey = HashMap::<String, nostr::Event>::new();
    for event in events.iter().filter(|event| {
        event.kind.as_u16() as u32 == KIND_MANAGED_AGENT && event.pubkey.to_hex() == owner_pubkey
    }) {
        let Some(pubkey) = event.tags.iter().find_map(|tag| {
            let values = tag.as_slice();
            if values.first().map(String::as_str) != Some("d") {
                return None;
            }
            nostr::PublicKey::from_hex(values.get(1)?.as_str())
                .ok()
                .map(|parsed| parsed.to_hex())
        }) else {
            continue;
        };
        match latest_by_pubkey.entry(pubkey) {
            Entry::Vacant(entry) => {
                entry.insert(event.clone());
            }
            Entry::Occupied(mut entry) if event_is_newer(event, entry.get()) => {
                entry.insert(event.clone());
            }
            Entry::Occupied(_) => {}
        }
    }
    latest_by_pubkey
}

pub(super) fn latest_owner_managed_event_versions(
    events: &[nostr::Event],
    owner_pubkey: &str,
) -> HashMap<String, nostr::Event> {
    latest_owner_managed_events(events, owner_pubkey)
}

pub(super) fn owner_managed_agents(
    events: &[nostr::Event],
    owner_pubkey: &str,
) -> HashMap<String, ManagedAgentEventContent> {
    latest_owner_managed_events(events, owner_pubkey)
        .into_iter()
        .filter_map(|(pubkey, event)| {
            let managed =
                crate::managed_agents::agent_events::managed_agent_content_from_event(&event)
                    .ok()?;
            Some((pubkey, managed))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_managed_declarations_require_exact_owner_and_valid_pubkey() {
        let owner = nostr::Keys::generate();
        let other_owner = nostr::Keys::generate();
        let canonical = nostr::Keys::generate().public_key().to_hex();
        let foreign = nostr::Keys::generate().public_key().to_hex();
        let managed = nostr::EventBuilder::new(
            nostr::Kind::Custom(KIND_MANAGED_AGENT as u16),
            r#"{"name":"MUSE","persona_id":"builtin:fizz","parallelism":1,"respond_to":"owner-only"}"#,
        )
        .tags(vec![
            nostr::Tag::parse(["d", canonical.as_str()]).unwrap()
        ])
        .sign_with_keys(&owner)
        .unwrap();
        let foreign_event = nostr::EventBuilder::new(
            nostr::Kind::Custom(KIND_MANAGED_AGENT as u16),
            r#"{"name":"Other","parallelism":1,"respond_to":"owner-only"}"#,
        )
        .tags(vec![nostr::Tag::parse(["d", foreign.as_str()]).unwrap()])
        .sign_with_keys(&other_owner)
        .unwrap();
        let malformed = nostr::EventBuilder::new(
            nostr::Kind::Custom(KIND_MANAGED_AGENT as u16),
            r#"{"name":"Bad","parallelism":1,"respond_to":"owner-only"}"#,
        )
        .tags(vec![nostr::Tag::parse(["d", "not-a-pubkey"]).unwrap()])
        .sign_with_keys(&owner)
        .unwrap();

        let agents = owner_managed_agents(
            &[managed, foreign_event, malformed],
            &owner.public_key().to_hex(),
        );

        assert_eq!(agents.len(), 1);
        assert_eq!(
            agents
                .get(&canonical)
                .and_then(|agent| agent.persona_id.as_deref()),
            Some("builtin:fizz")
        );
    }

    #[test]
    fn owner_declaration_preserves_canonical_agent_without_directory_profile() {
        let canonical = nostr::Keys::generate().public_key().to_hex();
        let managed = ManagedAgentEventContent {
            name: "MUSE".to_string(),
            persona_id: Some("builtin:fizz".to_string()),
            system_prompt: None,
            model: None,
            provider: None,
            persona_source_version: None,
            parallelism: 1,
            respond_to: crate::managed_agents::RespondTo::OwnerOnly,
            respond_to_allowlist: vec![],
        };
        let mut agents = vec![];

        append_missing_owner_managed_agents(
            &mut agents,
            &HashMap::from([(canonical.clone(), managed)]),
        );

        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].pubkey, canonical);
        assert!(agents[0].is_owner_managed);
        assert_eq!(
            agents[0].owner_managed_persona_id.as_deref(),
            Some("builtin:fizz")
        );
    }

    #[test]
    fn owner_tombstones_retire_only_the_exact_managed_coordinate() {
        let owner = nostr::Keys::generate();
        let other_owner = nostr::Keys::generate();
        let retired = nostr::Keys::generate().public_key().to_hex();
        let protected = nostr::Keys::generate().public_key().to_hex();
        let retired_event = crate::managed_agents::agent_events::build_agent_delete(
            &retired,
            &owner.public_key().to_hex(),
        )
        .unwrap()
        .sign_with_keys(&owner)
        .unwrap();
        let foreign_event = crate::managed_agents::agent_events::build_agent_delete(
            &protected,
            &other_owner.public_key().to_hex(),
        )
        .unwrap()
        .sign_with_keys(&other_owner)
        .unwrap();

        let retired_pubkeys = retired_owner_managed_pubkeys(
            &[retired_event, foreign_event],
            &owner.public_key().to_hex(),
            &HashMap::new(),
        );

        assert_eq!(retired_pubkeys, HashSet::from([retired]));
        assert!(!retired_pubkeys.contains(&protected));
    }

    #[test]
    fn tombstoned_directory_profile_stays_hidden_until_exact_redeclaration() {
        let owner = nostr::Keys::generate();
        let retired = nostr::Keys::generate();
        let alice = nostr::Keys::generate();
        let retired_profile =
            nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"Old XENA"}"#)
                .sign_with_keys(&retired)
                .unwrap();
        let alice_profile =
            nostr::EventBuilder::new(nostr::Kind::Custom(10100), r#"{"name":"Alice"}"#)
                .sign_with_keys(&alice)
                .unwrap();
        let retired_pubkey = retired.public_key().to_hex();
        let deletion = crate::managed_agents::agent_events::build_agent_delete(
            &retired_pubkey,
            &owner.public_key().to_hex(),
        )
        .unwrap()
        .custom_created_at(nostr::Timestamp::from(1_000_u64))
        .sign_with_keys(&owner)
        .unwrap();
        let deletion_events = [deletion];
        let retired_pubkeys = retired_owner_managed_pubkeys(
            &deletion_events,
            &owner.public_key().to_hex(),
            &HashMap::new(),
        );

        let hidden = active_directory_events(
            vec![retired_profile.clone(), alice_profile.clone()],
            &retired_pubkeys,
        );
        assert_eq!(hidden, vec![alice_profile.clone()]);

        let declaration = nostr::EventBuilder::new(
            nostr::Kind::Custom(KIND_MANAGED_AGENT as u16),
            r#"{"name":"XENA","parallelism":1,"respond_to":"owner-only"}"#,
        )
        .tags(vec![
            nostr::Tag::parse(["d", retired_pubkey.as_str()]).unwrap()
        ])
        .custom_created_at(nostr::Timestamp::from(2_000_u64))
        .sign_with_keys(&owner)
        .unwrap();
        let declaration_events = [declaration];
        let declaration_versions =
            latest_owner_managed_event_versions(&declaration_events, &owner.public_key().to_hex());
        let restored_pubkeys = retired_owner_managed_pubkeys(
            &deletion_events,
            &owner.public_key().to_hex(),
            &declaration_versions,
        );
        let restored = active_directory_events(
            vec![retired_profile.clone(), alice_profile.clone()],
            &restored_pubkeys,
        );
        assert_eq!(restored, vec![retired_profile, alice_profile]);
    }
}
