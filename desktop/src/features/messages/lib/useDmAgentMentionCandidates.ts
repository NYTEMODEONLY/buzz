import * as React from "react";

import { getPinnedDmPeerPubkeys } from "@/features/agents/lib/agentAutocompleteEligibility";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import type { Channel } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import type { MentionCandidate } from "./mentionCandidates";

type DmAgentMentionCandidates = {
  candidates: MentionCandidate[];
};

/**
 * Resolve owner-pinned DM peers that identify as agents in their kind-0
 * profile. A joined DM alone is not identity or invocation authority.
 */
export function useDmAgentMentionCandidates(
  channels: readonly Channel[] | undefined,
  currentPubkey?: string | null,
  allowedPubkeys: ReadonlySet<string> = new Set(),
): DmAgentMentionCandidates {
  const dmPeerPubkeys = React.useMemo(
    () => [...getPinnedDmPeerPubkeys(channels, currentPubkey, allowedPubkeys)],
    [allowedPubkeys, channels, currentPubkey],
  );
  const dmPeerProfilesQuery = useUsersBatchQuery(dmPeerPubkeys, {
    enabled: dmPeerPubkeys.length > 0,
  });

  return React.useMemo(() => {
    const candidates: MentionCandidate[] = [];

    for (const [pubkey, profile] of Object.entries(
      dmPeerProfilesQuery.data?.profiles ?? {},
    )) {
      if (profile.isAgent !== true) continue;

      const normalized = normalizePubkey(pubkey);
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

    return { candidates };
  }, [dmPeerProfilesQuery.data?.profiles]);
}
