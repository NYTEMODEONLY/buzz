import type { ManagedAgent, RelayAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { isManagedAgentActive } from "./managedAgentControlActions";

/**
 * Persona id to exact canonical pubkeys declared by the current owner.
 * Display names are deliberately excluded: identity authority is pubkey-only.
 */
export function ownerManagedPubkeysByPersonaId(
  relayAgents: readonly RelayAgent[],
): Map<string, Set<string>> {
  const byPersona = new Map<string, Set<string>>();
  for (const agent of relayAgents) {
    if (!agent.isOwnerManaged || !agent.ownerManagedPersonaId) continue;
    const pubkeys =
      byPersona.get(agent.ownerManagedPersonaId) ?? new Set<string>();
    pubkeys.add(normalizePubkey(agent.pubkey));
    byPersona.set(agent.ownerManagedPersonaId, pubkeys);
  }
  return byPersona;
}

/**
 * Keep only local records authorized to expose runtime controls.
 *
 * Until owner declarations resolve successfully, persona-backed records are
 * withheld: an empty pending/error response is not proof that no canonical
 * identity exists on another install. Definition-less custom agents cannot
 * collide on persona coordinates and remain available.
 */
export function runnableLocalManagedAgents<
  T extends Pick<ManagedAgent, "personaId" | "pubkey">,
>(
  managedAgents: readonly T[],
  relayAgents: readonly RelayAgent[],
  ownerManagedDeclarationsResolved: boolean,
): T[] {
  if (!ownerManagedDeclarationsResolved) {
    return managedAgents.filter((agent) => !agent.personaId);
  }

  const canonicalByPersona = ownerManagedPubkeysByPersonaId(relayAgents);
  return managedAgents.filter((agent) => {
    if (!agent.personaId) return true;
    const canonicalPubkeys = canonicalByPersona.get(agent.personaId);
    if (!canonicalPubkeys || canonicalPubkeys.size === 0) return true;
    return canonicalPubkeys.has(normalizePubkey(agent.pubkey));
  });
}

/**
 * Definitions allowed to expose a launch control without minting a sibling of
 * an existing owner-managed identity.
 */
export function launchableLibraryPersonas<T extends { id: string }>(
  personas: readonly T[],
  relayAgents: readonly RelayAgent[],
  ownerManagedDeclarationsResolved: boolean,
): T[] {
  if (!ownerManagedDeclarationsResolved) return [];
  const ownerManagedPersonaIds = new Set(
    relayAgents
      .filter((agent) => agent.isOwnerManaged)
      .flatMap((agent) =>
        agent.ownerManagedPersonaId ? [agent.ownerManagedPersonaId] : [],
      ),
  );
  return personas.filter((persona) => !ownerManagedPersonaIds.has(persona.id));
}

/** Filter discovery candidates against a settled relay archive snapshot. */
export function withoutArchivedAgents<T extends { pubkey: string }>(
  agents: readonly T[],
  archivedPubkeys: ReadonlySet<string>,
): T[] {
  const archived = new Set([...archivedPubkeys].map(normalizePubkey));
  return agents.filter((agent) => !archived.has(normalizePubkey(agent.pubkey)));
}

/**
 * Bulk controls consume an already-authorized list and never rebuild targets
 * from the full managed-agent registry.
 */
export function activeAuthorizedManagedAgents<
  T extends Pick<ManagedAgent, "status">,
>(authorizedAgents: readonly T[]): T[] {
  return authorizedAgents.filter((agent) => isManagedAgentActive(agent));
}
