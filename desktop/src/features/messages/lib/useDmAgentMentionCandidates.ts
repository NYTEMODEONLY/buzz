import * as React from "react";

import { getJoinedDmPeerPubkeys } from "@/features/agents/lib/agentAutocompleteEligibility";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import type { Channel } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import type { MentionCandidate } from "./mentionCandidates";

type DmAgentMentionCandidates = {
  candidates: MentionCandidate[];
  pubkeys: ReadonlySet<string>;
};

/**
 * Resolve already-known DM peers that identify as agents in their kind-0
 * profile. This keeps a canonical external agent mentionable when the broader
 * kind-10100 directory query is incomplete, without admitting arbitrary
 * global agent search results.
 */
export function useDmAgentMentionCandidates(
  channels: readonly Channel[] | undefined,
  currentPubkey?: string | null,
): DmAgentMentionCandidates {
  const dmPeerPubkeys = React.useMemo(
    () => [...getJoinedDmPeerPubkeys(channels, currentPubkey)],
    [channels, currentPubkey],
  );
  const dmPeerProfilesQuery = useUsersBatchQuery(dmPeerPubkeys, {
    enabled: dmPeerPubkeys.length > 0,
  });

  return React.useMemo(() => {
    const candidates: MentionCandidate[] = [];
    const pubkeys = new Set<string>();

    for (const [pubkey, profile] of Object.entries(
      dmPeerProfilesQuery.data?.profiles ?? {},
    )) {
      if (profile.isAgent !== true) continue;

      const normalized = normalizePubkey(pubkey);
      pubkeys.add(normalized);
      candidates.push({
        kind: "identity",
        pubkey: normalized,
        displayName:
          profile.displayName?.trim() ||
          profile.name?.trim() ||
          profile.nip05Handle?.trim() ||
          null,
        avatarUrl: profile.avatarUrl,
        isMember: false,
        isAgent: true,
        ownerPubkey: profile.ownerPubkey,
        secondaryLabel:
          profile.displayName?.trim() && profile.nip05Handle?.trim()
            ? profile.nip05Handle
            : null,
      });
    }

    return { candidates, pubkeys };
  }, [dmPeerProfilesQuery.data?.profiles]);
}
