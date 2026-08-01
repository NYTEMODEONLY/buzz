use nostr::{EventBuilder, Keys, Kind, Tag};
use serde_json::Value;

use super::agents_from_events;

fn oa_event(content: &str) -> (nostr::Event, String) {
    let agent_keys = Keys::generate();
    let owner_keys = Keys::generate();
    let agent_pubkey = agent_keys.public_key();
    let tag_json = buzz_sdk_pkg::nip_oa::compute_auth_tag(&owner_keys, &agent_pubkey, "")
        .expect("compute auth tag");
    let tag_values: Vec<String> = serde_json::from_str(&tag_json).expect("parse auth tag json");
    let auth_tag = Tag::parse(tag_values).expect("parse auth tag");
    let event = EventBuilder::new(Kind::from_u16(10100), content)
        .tags(vec![auth_tag])
        .sign_with_keys(&agent_keys)
        .expect("sign");
    (event, owner_keys.public_key().to_hex())
}

#[test]
fn agents_derives_owner_from_valid_nip_oa_auth_tag() {
    let (event, owner_pubkey) = oa_event(r#"{"name":"Scout","respond_to":"owner-only"}"#);
    let value = agents_from_events(std::slice::from_ref(&event));
    let agents = value.get("agents").cloned().unwrap();
    let parsed: Vec<crate::managed_agents::RelayAgentInfo> =
        serde_json::from_value(agents).unwrap();

    assert_eq!(parsed.len(), 1);
    assert_eq!(parsed[0].pubkey, event.pubkey.to_hex());
    assert_eq!(
        parsed[0].owner_pubkey.as_deref(),
        Some(owner_pubkey.as_str())
    );
}

#[test]
fn agents_rejects_self_claimed_owner_without_valid_nip_oa_auth_tag() {
    let claimed_owner = "a".repeat(64);
    let keys = Keys::generate();
    let event = EventBuilder::new(
        Kind::from_u16(10100),
        format!(r#"{{"name":"Scout","owner_pubkey":"{claimed_owner}","respond_to":"owner-only"}}"#),
    )
    .sign_with_keys(&keys)
    .expect("sign");
    let value = agents_from_events(std::slice::from_ref(&event));
    let agents: &Value = value.get("agents").unwrap();
    let parsed: Vec<crate::managed_agents::RelayAgentInfo> =
        serde_json::from_value(agents.clone()).unwrap();

    assert_eq!(parsed.len(), 1);
    assert_eq!(parsed[0].owner_pubkey, None);
}
