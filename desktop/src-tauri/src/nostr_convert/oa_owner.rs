use nostr::Event;

/// Return the owner pubkey from a valid NIP-OA owner tag.
///
/// NIP-OA marks an agent identity by having the owner sign an `auth` tag for
/// the agent pubkey. Verification is against the event author, so a forged or
/// stale marker cannot turn a person into an agent in mention search.
pub(super) fn valid_oa_owner_pubkey(event: &Event) -> Option<String> {
    let target_hex = event.pubkey.to_hex();
    let Ok(target_pubkey) = nostr::PublicKey::from_hex(&target_hex) else {
        return None;
    };

    for tag in event.tags.iter() {
        let slice = tag.as_slice();
        if slice.first().map(String::as_str) != Some("auth") || slice.len() != 4 {
            continue;
        }
        let Ok(json) = serde_json::to_string(slice) else {
            continue;
        };
        if let Ok(owner_pubkey) = buzz_sdk_pkg::nip_oa::verify_auth_tag(&json, &target_pubkey) {
            return Some(owner_pubkey.to_hex());
        }
    }

    None
}
