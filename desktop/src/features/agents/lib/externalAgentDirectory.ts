import type { RelayAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

export function externalRelayAgents(
  relayAgents: readonly RelayAgent[],
  locallyManagedPubkeys: ReadonlySet<string>,
): RelayAgent[] {
  const normalizedLocalPubkeys = new Set(
    [...locallyManagedPubkeys].map(normalizePubkey),
  );
  return relayAgents.filter(
    (agent) =>
      !agent.isOwnerManaged &&
      !normalizedLocalPubkeys.has(normalizePubkey(agent.pubkey)),
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
