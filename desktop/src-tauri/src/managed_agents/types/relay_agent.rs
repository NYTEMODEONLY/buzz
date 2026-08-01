use serde::{Deserialize, Serialize};

use super::RespondTo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayAgentInfo {
    pub pubkey: String,
    pub name: String,
    /// NIP-OA verified owner from the agent-authored directory event.
    #[serde(default)]
    pub owner_pubkey: Option<String>,
    /// Relay-backed ownership by the current Buzz identity.
    #[serde(default)]
    pub is_owner_managed: bool,
    #[serde(default)]
    pub owner_managed_persona_id: Option<String>,
    pub agent_type: String,
    pub channels: Vec<String>,
    #[serde(default)]
    pub channel_ids: Vec<String>,
    pub capabilities: Vec<String>,
    pub status: String,
    #[serde(default)]
    pub respond_to: Option<RespondTo>,
    #[serde(default)]
    pub respond_to_allowlist: Vec<String>,
}
