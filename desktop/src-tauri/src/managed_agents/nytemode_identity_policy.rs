//! Exact-pubkey repair policy for superseded NYTEMODE Main identities.
//!
//! This is intentionally not a name-based or whole-store deletion reconcile.
//! Each retirement is allowed only when the exact canonical replacement is
//! present in the local registry with the expected persona, the superseded
//! pubkey is absent locally, and the retained declaration carries that same
//! persona. The operation removes only the stale retained 30177 coordinate and
//! queues its owner-signed kind-5 tombstone for the normal durable flush loop.

use std::path::Path;

use buzz_core_pkg::kind::KIND_MANAGED_AGENT;
use nostr::JsonUtil;
use rusqlite::TransactionBehavior;
use tauri::Manager;

use super::{
    agent_events::{build_agent_delete, ManagedAgentEventContent},
    persona_events::monotonic_created_at,
    retention::{
        delete_retained_event, get_retained_event, open_retention_db, retain_event,
        tombstone_retention_d_tag, RetainedEvent,
    },
    ManagedAgentRecord,
};

const KIND_DELETE: u32 = 5;

struct SupersededIdentity {
    stale_pubkey: &'static str,
    canonical_pubkey: &'static str,
    persona_id: &'static str,
}

const SUPERSEDED_IDENTITIES: &[SupersededIdentity] = &[
    SupersededIdentity {
        stale_pubkey: "f4de8ae1f1a06bcc6a9152024af249e95d5c769fac7b3f1f0847f5d46480ca67",
        canonical_pubkey: "fae5652189cb03b8b504523903738668502ad28a559cc5e90c4d31b4ec38455d",
        persona_id: "builtin:honey",
    },
    SupersededIdentity {
        stale_pubkey: "3a6275a3411195e9fc33a5107fd0e6bfc89aa38ef41599dc30f9d11b7cad46e8",
        canonical_pubkey: "33d57ef8b5908cadbb041371ece7bed578ccde442eaf02877cd5f4761f8cf12e",
        persona_id: "builtin:bumble",
    },
    SupersededIdentity {
        stale_pubkey: "44531d553d20a29e9aabf806faa2aca8ee4715dd487e1bf00ba76a433c41b5aa",
        canonical_pubkey: "a01c81071e15dc14e52eae1e169f1c684a3e2b4d9c2b63f0599aee9444a917ba",
        persona_id: "19fbb927-5684-41de-b40a-fcaa3655e4ed",
    },
];

pub(crate) fn retire_superseded_identities(
    app: &tauri::AppHandle,
    owner_keys: &nostr::Keys,
    db_path: &Path,
) {
    let result = (|| -> Result<u32, String> {
        let state = app.state::<crate::app_state::AppState>();
        let _store_guard = state
            .managed_agents_store_lock
            .lock()
            .map_err(|error| format!("managed-agent store lock is poisoned: {error}"))?;
        let base_dir = super::managed_agents_base_dir(app)?;
        let store_path = base_dir.join("managed-agents.json");
        let raw = std::fs::read_to_string(&store_path)
            .map_err(|e| format!("failed to read managed-agents.json: {e}"))?;
        let records: Vec<ManagedAgentRecord> = serde_json::from_str(&raw)
            .map_err(|e| format!("failed to parse managed-agents.json: {e}"))?;
        retire_superseded_identities_in_store(&records, owner_keys, db_path)
    })();

    match result {
        Ok(0) => {}
        Ok(retired) => eprintln!(
            "buzz-desktop: nytemode-identity-policy: queued {retired} exact identity tombstones"
        ),
        Err(error) => eprintln!("buzz-desktop: nytemode-identity-policy: {error}"),
    }
}

fn retire_superseded_identities_in_store(
    records: &[ManagedAgentRecord],
    owner_keys: &nostr::Keys,
    db_path: &Path,
) -> Result<u32, String> {
    let owner_pubkey = owner_keys.public_key().to_hex();
    let mut conn = open_retention_db(db_path)?;
    let mut retired = 0;
    let mut failures = Vec::new();

    for policy in SUPERSEDED_IDENTITIES {
        let result = (|| -> Result<bool, String> {
            let transaction = conn
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|error| format!("failed to begin identity retirement: {error}"))?;
            let Some(existing) = get_retained_event(
                &transaction,
                KIND_MANAGED_AGENT,
                &owner_pubkey,
                policy.stale_pubkey,
            )?
            else {
                transaction
                    .commit()
                    .map_err(|error| format!("failed to finish identity check: {error}"))?;
                return Ok(false);
            };

            if records
                .iter()
                .any(|record| record.pubkey == policy.stale_pubkey)
            {
                return Err(format!(
                    "refusing to retire active local identity {}",
                    policy.stale_pubkey
                ));
            }
            let canonical_present = records.iter().any(|record| {
                record.pubkey == policy.canonical_pubkey
                    && record.persona_id.as_deref() == Some(policy.persona_id)
            });
            if !canonical_present {
                return Err(format!(
                    "canonical replacement {} with persona {} is not present",
                    policy.canonical_pubkey, policy.persona_id
                ));
            }

            let content: ManagedAgentEventContent = serde_json::from_str(&existing.content)
                .map_err(|e| {
                    format!(
                        "failed to parse retained identity {}: {e}",
                        policy.stale_pubkey
                    )
                })?;
            if content.persona_id.as_deref() != Some(policy.persona_id) {
                return Err(format!(
                    "refusing to retire {}: retained persona does not match {}",
                    policy.stale_pubkey, policy.persona_id
                ));
            }

            let event = build_agent_delete(policy.stale_pubkey, &owner_pubkey)?
                .custom_created_at(monotonic_created_at(Some(existing.created_at)))
                .sign_with_keys(owner_keys)
                .map_err(|e| format!("failed to sign identity tombstone: {e}"))?;
            delete_retained_event(
                &transaction,
                KIND_MANAGED_AGENT,
                &owner_pubkey,
                policy.stale_pubkey,
            )?;
            retain_event(
                &transaction,
                &RetainedEvent {
                    kind: KIND_DELETE,
                    pubkey: owner_pubkey.clone(),
                    d_tag: tombstone_retention_d_tag(KIND_MANAGED_AGENT, policy.stale_pubkey),
                    content: event.content.to_string(),
                    created_at: event.created_at.as_secs() as i64,
                    raw_event: event.as_json(),
                    pending_sync: true,
                },
            )?;
            transaction
                .commit()
                .map_err(|error| format!("failed to commit identity retirement: {error}"))?;
            Ok(true)
        })();

        match result {
            Ok(true) => retired += 1,
            Ok(false) => {}
            Err(error) => failures.push(error),
        }
    }

    if failures.is_empty() {
        Ok(retired)
    } else {
        Err(format!(
            "queued {retired} exact identity tombstones; {}",
            failures.join("; ")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managed_agents::{AgentDefinition, RespondTo};

    fn keyed_record(pubkey: &str, persona_id: &str) -> ManagedAgentRecord {
        let mut record = AgentDefinition {
            id: persona_id.to_string(),
            display_name: persona_id.to_string(),
            avatar_url: None,
            system_prompt: String::new(),
            runtime: None,
            model: None,
            provider: None,
            name_pool: vec![],
            is_builtin: false,
            is_active: true,
            shared: false,
            source_team: None,
            source_team_persona_slug: None,
            catalog_source: None,
            env_vars: Default::default(),
            respond_to: None,
            respond_to_allowlist: vec![],
            parallelism: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
        .into_agent_record();
        record.pubkey = pubkey.to_string();
        record.persona_id = Some(persona_id.to_string());
        record.slug = None;
        record.respond_to = RespondTo::OwnerOnly;
        record
    }

    fn canonical_records() -> Vec<ManagedAgentRecord> {
        SUPERSEDED_IDENTITIES
            .iter()
            .map(|policy| keyed_record(policy.canonical_pubkey, policy.persona_id))
            .collect()
    }

    fn retain_stale_declaration(
        db_path: &Path,
        owner: &nostr::Keys,
        policy: &SupersededIdentity,
    ) -> nostr::Event {
        let conn = open_retention_db(db_path).unwrap();
        let stale = keyed_record(policy.stale_pubkey, policy.persona_id);
        let declaration = super::super::agent_events::build_agent_event(&stale)
            .unwrap()
            .custom_created_at(nostr::Timestamp::from(100_u64))
            .sign_with_keys(owner)
            .unwrap();
        retain_event(
            &conn,
            &RetainedEvent {
                kind: KIND_MANAGED_AGENT,
                pubkey: owner.public_key().to_hex(),
                d_tag: policy.stale_pubkey.to_string(),
                content: declaration.content.to_string(),
                created_at: declaration.created_at.as_secs() as i64,
                raw_event: declaration.as_json(),
                pending_sync: false,
            },
        )
        .unwrap();
        declaration
    }

    #[test]
    fn exact_policy_queues_tombstone_only_after_canonical_replacement_check() {
        let owner = nostr::Keys::generate();
        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("retention.db");
        let policy = &SUPERSEDED_IDENTITIES[0];
        let declaration = retain_stale_declaration(&db_path, &owner, policy);

        assert_eq!(
            retire_superseded_identities_in_store(&canonical_records(), &owner, &db_path).unwrap(),
            1
        );

        let conn = open_retention_db(&db_path).unwrap();
        assert!(get_retained_event(
            &conn,
            KIND_MANAGED_AGENT,
            &owner.public_key().to_hex(),
            policy.stale_pubkey,
        )
        .unwrap()
        .is_none());
        let tombstone = get_retained_event(
            &conn,
            KIND_DELETE,
            &owner.public_key().to_hex(),
            &tombstone_retention_d_tag(KIND_MANAGED_AGENT, policy.stale_pubkey),
        )
        .unwrap()
        .expect("exact tombstone retained");
        assert!(tombstone.pending_sync);
        assert!(tombstone.created_at > declaration.created_at.as_secs() as i64);
    }

    #[test]
    fn exact_policy_refuses_to_retire_a_locally_present_pubkey() {
        let owner = nostr::Keys::generate();
        let temp = tempfile::tempdir().unwrap();
        let policy = &SUPERSEDED_IDENTITIES[0];
        let db_path = temp.path().join("db");
        retain_stale_declaration(&db_path, &owner, policy);
        let mut records = canonical_records();
        records.push(keyed_record(policy.stale_pubkey, policy.persona_id));

        let error = retire_superseded_identities_in_store(&records, &owner, &db_path).unwrap_err();

        assert!(error.contains("refusing to retire active local identity"));
        let conn = open_retention_db(&db_path).unwrap();
        assert!(get_retained_event(
            &conn,
            KIND_MANAGED_AGENT,
            &owner.public_key().to_hex(),
            policy.stale_pubkey,
        )
        .unwrap()
        .is_some());
    }

    #[test]
    fn exact_policy_rolls_back_declaration_delete_when_tombstone_insert_fails() {
        let owner = nostr::Keys::generate();
        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("retention.db");
        let policy = &SUPERSEDED_IDENTITIES[0];
        retain_stale_declaration(&db_path, &owner, policy);
        let conn = open_retention_db(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER reject_identity_tombstone
             BEFORE INSERT ON persona_events
             WHEN NEW.kind = 5
             BEGIN
               SELECT RAISE(FAIL, 'injected tombstone failure');
             END;",
        )
        .unwrap();
        drop(conn);

        let error = retire_superseded_identities_in_store(&canonical_records(), &owner, &db_path)
            .unwrap_err();

        assert!(error.contains("injected tombstone failure"));
        let conn = open_retention_db(&db_path).unwrap();
        assert!(get_retained_event(
            &conn,
            KIND_MANAGED_AGENT,
            &owner.public_key().to_hex(),
            policy.stale_pubkey,
        )
        .unwrap()
        .is_some());
    }
}
