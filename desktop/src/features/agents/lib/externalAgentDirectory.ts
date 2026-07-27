import type { ManagedAgent, RelayAgent } from "@/shared/api/types";
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

/**
 * Owner-managed relay agents that this install does not hold keys for.
 * Identity is pubkey-authoritative: a same-name local sibling must not hide
 * the canonical owner-managed card (Managed elsewhere).
 */
export function ownerManagedRelayAgents(
  relayAgents: readonly RelayAgent[],
  locallyManagedPubkeys: ReadonlySet<string>,
): RelayAgent[] {
  const normalizedLocalPubkeys = new Set(
    [...locallyManagedPubkeys].map(normalizePubkey),
  );
  return relayAgents.filter(
    (agent) =>
      agent.isOwnerManaged &&
      !normalizedLocalPubkeys.has(normalizePubkey(agent.pubkey)),
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

/**
 * Owner-managed persona id → set of canonical pubkeys declared on the relay.
 */
export function ownerManagedPubkeysByPersonaId(
  relayAgents: readonly RelayAgent[],
): Map<string, Set<string>> {
  const byPersona = new Map<string, Set<string>>();
  for (const agent of relayAgents) {
    if (!agent.isOwnerManaged || !agent.ownerManagedPersonaId) continue;
    const personaId = agent.ownerManagedPersonaId;
    const pubkeys = byPersona.get(personaId) ?? new Set<string>();
    pubkeys.add(normalizePubkey(agent.pubkey));
    byPersona.set(personaId, pubkeys);
  }
  return byPersona;
}

/**
 * Drop local managed instances that are non-canonical siblings of a remote
 * owner-managed identity: same persona id, different pubkey. Those siblings
 * must not expose Start / edit / runtime controls; the canonical card is
 * rendered as Managed elsewhere instead.
 *
 * Local agents that hold the owner-managed pubkey (this install is the host)
 * are kept. Agents without a persona id are kept (custom instances).
 */
export function runnableLocalManagedAgents<
  T extends Pick<ManagedAgent, "pubkey" | "personaId">,
>(managedAgents: readonly T[], relayAgents: readonly RelayAgent[]): T[] {
  const canonicalByPersona = ownerManagedPubkeysByPersonaId(relayAgents);
  if (canonicalByPersona.size === 0) return [...managedAgents];

  return managedAgents.filter((agent) => {
    if (!agent.personaId) return true;
    const canonicalPubkeys = canonicalByPersona.get(agent.personaId);
    if (!canonicalPubkeys || canonicalPubkeys.size === 0) return true;
    return canonicalPubkeys.has(normalizePubkey(agent.pubkey));
  });
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
