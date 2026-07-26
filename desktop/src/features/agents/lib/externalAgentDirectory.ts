import type { RelayAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

export function externalRelayAgents(
  relayAgents: readonly RelayAgent[],
  locallyManagedPubkeys: ReadonlySet<string>,
  locallyManagedNames: ReadonlySet<string>,
): RelayAgent[] {
  const normalizedLocalPubkeys = new Set(
    [...locallyManagedPubkeys].map(normalizePubkey),
  );
  // Archived managed coordinates can disappear from the relay's live
  // kind:30177 view while their directory profile remains visible. If the
  // same install already renders a managed card with that exact name, suppress
  // the stale duplicate from External agents.
  const normalizedLocalNames = new Set(
    [...locallyManagedNames].map((name) => name.trim().toLowerCase()),
  );
  return relayAgents.filter(
    (agent) =>
      !agent.isOwnerManaged &&
      !normalizedLocalPubkeys.has(normalizePubkey(agent.pubkey)) &&
      !normalizedLocalNames.has(agent.name.trim().toLowerCase()),
  );
}

export function ownerManagedRelayAgents(
  relayAgents: readonly RelayAgent[],
  locallyManagedPubkeys: ReadonlySet<string>,
  locallyManagedNames: ReadonlySet<string>,
): RelayAgent[] {
  const normalizedLocalPubkeys = new Set(
    [...locallyManagedPubkeys].map(normalizePubkey),
  );
  const normalizedLocalNames = new Set(
    [...locallyManagedNames].map((name) => name.trim().toLowerCase()),
  );
  return relayAgents.filter(
    (agent) =>
      agent.isOwnerManaged &&
      !normalizedLocalPubkeys.has(normalizePubkey(agent.pubkey)) &&
      !normalizedLocalNames.has(agent.name.trim().toLowerCase()),
  );
}

export function ownerManagedPersonaIds(
  relayAgents: readonly RelayAgent[],
): Set<string> {
  return new Set(
    relayAgents
      .filter((agent) => agent.isOwnerManaged)
      .flatMap((agent) =>
        agent.ownerManagedPersonaId ? [agent.ownerManagedPersonaId] : [],
      ),
  );
}

export function formatExternalAgentType(agentType: string): string {
  const normalized = agentType.trim().toLowerCase();
  if (!normalized || normalized === "agent") {
    return "External runtime";
  }

  return normalized
    .split(/[-_\s]+/)
    .filter((part) => part && part !== "acp")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
