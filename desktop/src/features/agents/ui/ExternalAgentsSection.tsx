import { Pencil } from "lucide-react";
import * as React from "react";

import {
  externalAgentPresentationScope,
  formatExternalAgentRuntimeLabel,
  useExternalAgentPresentations,
} from "@/features/agents/externalAgentPresentation";
import {
  getJoinedDmPeerPubkeys,
  getSharedChannelIds,
  relayAgentIsSharedWithUser,
} from "@/features/agents/lib/agentAutocompleteEligibility";
import { useChannelsQuery } from "@/features/channels/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { usePresenceQuery } from "@/features/presence/hooks";
import { PresenceBadge } from "@/features/presence/ui/PresenceBadge";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import type { RelayAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { AgentIdentityCard } from "./AgentIdentityCard";
import {
  ExternalAgentPresentationDialog,
  type ExternalAgentEditorTarget,
} from "./ExternalAgentPresentationDialog";

type ExternalAgentCard = ExternalAgentEditorTarget & {
  ownerPubkey: string | null;
};

export function ExternalAgentsSection({
  error,
  isLoading,
  managedPubkeys,
  onOpenAgentProfile,
  relayAgents,
}: {
  error: Error | null;
  isLoading: boolean;
  managedPubkeys: ReadonlySet<string>;
  onOpenAgentProfile: (pubkey: string) => void;
  relayAgents: RelayAgent[];
}) {
  const identityQuery = useIdentityQuery();
  const channelsQuery = useChannelsQuery();
  const { activeCommunity } = useCommunities();
  const [agentToCustomize, setAgentToCustomize] =
    React.useState<ExternalAgentCard | null>(null);
  const currentPubkey = normalizePubkey(identityQuery.data?.pubkey ?? "");
  const normalizedManagedPubkeys = React.useMemo(
    () => new Set([...managedPubkeys].map(normalizePubkey)),
    [managedPubkeys],
  );
  const presentationScope = externalAgentPresentationScope({
    identityPubkey: identityQuery.data?.pubkey,
    relayUrl: activeCommunity?.relayUrl,
  });
  const presentations = useExternalAgentPresentations(presentationScope);

  const sharedChannelIds = React.useMemo(
    () => getSharedChannelIds(channelsQuery.data),
    [channelsQuery.data],
  );
  const dmPeerPubkeys = React.useMemo(
    () =>
      getJoinedDmPeerPubkeys(channelsQuery.data, identityQuery.data?.pubkey),
    [channelsQuery.data, identityQuery.data?.pubkey],
  );
  const relevantRelayAgents = React.useMemo(
    () =>
      relayAgents.filter((agent) =>
        relayAgentIsSharedWithUser(
          agent,
          sharedChannelIds,
          identityQuery.data?.pubkey,
        ),
      ),
    [identityQuery.data?.pubkey, relayAgents, sharedChannelIds],
  );
  const candidatePubkeys = React.useMemo(() => {
    const pubkeys = new Set(dmPeerPubkeys);
    for (const agent of relevantRelayAgents) {
      pubkeys.add(normalizePubkey(agent.pubkey));
    }
    return [...pubkeys].filter(
      (pubkey) => !normalizedManagedPubkeys.has(pubkey),
    );
  }, [dmPeerPubkeys, normalizedManagedPubkeys, relevantRelayAgents]);
  const profilesQuery = useUsersBatchQuery(candidatePubkeys, {
    enabled: candidatePubkeys.length > 0,
  });
  const relayAgentsByPubkey = React.useMemo(
    () =>
      new Map(
        relevantRelayAgents.map((agent) => [
          normalizePubkey(agent.pubkey),
          agent,
        ]),
      ),
    [relevantRelayAgents],
  );

  const externalAgents = React.useMemo(() => {
    const cards: ExternalAgentCard[] = [];
    for (const pubkey of candidatePubkeys) {
      const profile = profilesQuery.data?.profiles[pubkey];
      if (profile?.isAgent !== true) continue;
      const relayAgent = relayAgentsByPubkey.get(pubkey);
      cards.push({
        pubkey,
        name:
          profile.displayName?.trim() ||
          profile.name?.trim() ||
          relayAgent?.name.trim() ||
          "External agent",
        avatarUrl: profile.avatarUrl,
        agentType: relayAgent?.agentType ?? null,
        ownerPubkey: profile.ownerPubkey,
      });
    }
    return cards.sort((left, right) => left.name.localeCompare(right.name));
  }, [candidatePubkeys, profilesQuery.data?.profiles, relayAgentsByPubkey]);
  const presenceQuery = usePresenceQuery(
    externalAgents.map((agent) => agent.pubkey),
    { enabled: externalAgents.length > 0 },
  );

  if (
    (isLoading || channelsQuery.isLoading || profilesQuery.isLoading) &&
    externalAgents.length === 0
  ) {
    return null;
  }
  if (externalAgents.length === 0 && !error) return null;

  return (
    <section className="space-y-3" data-testid="external-agents-section">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          External agents
        </h2>
        <p className="text-sm text-muted-foreground">
          Agents hosted outside this Buzz app. Their runtime controls stay with
          their host.
        </p>
      </div>

      {externalAgents.length > 0 ? (
        <div
          className="grid w-full grid-cols-[repeat(auto-fill,minmax(220px,240px))] justify-start gap-3"
          data-testid="external-agent-cards"
        >
          {externalAgents.map((agent) => {
            const presentation = presentations[agent.pubkey] ?? null;
            const runtimeLabel = formatExternalAgentRuntimeLabel(
              presentation?.runtimeLabel ?? agent.agentType,
            );
            const canCustomize =
              presentationScope !== null &&
              normalizePubkey(agent.ownerPubkey ?? "") === currentPubkey;
            const liveStatus = presenceQuery.data?.[agent.pubkey] ?? "offline";
            return (
              <AgentIdentityCard
                actions={
                  canCustomize ? (
                    <Button
                      aria-label={`Edit ${agent.name}`}
                      className="h-8 w-8 rounded-full"
                      data-testid={`edit-external-agent-${agent.pubkey}`}
                      onClick={() => setAgentToCustomize(agent)}
                      size="icon"
                      variant="secondary"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null
                }
                ariaLabel={`${agent.name} external agent profile`}
                avatarUrl={agent.avatarUrl}
                dataTestId={`external-agent-card-${agent.pubkey}`}
                key={agent.pubkey}
                label={agent.name}
                modelLabel="Hosted externally"
                onClick={() => onOpenAgentProfile(agent.pubkey)}
                statusBadge={
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="info">EXTERNAL</Badge>
                    {runtimeLabel ? (
                      <Badge variant="secondary">{runtimeLabel}</Badge>
                    ) : null}
                    <PresenceBadge
                      className="border-0 bg-transparent px-0 py-0 text-2xs"
                      status={liveStatus}
                    />
                  </span>
                }
              />
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <ExternalAgentPresentationDialog
        agent={agentToCustomize}
        onOpenChange={(open) => {
          if (!open) setAgentToCustomize(null);
        }}
        open={agentToCustomize !== null}
        presentation={
          agentToCustomize
            ? (presentations[agentToCustomize.pubkey] ?? null)
            : null
        }
        scope={presentationScope}
      />
    </section>
  );
}
