import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Search } from "lucide-react";

import { externalAgentPresentationScope } from "@/features/agents/externalAgentPresentation";
import {
  useArchivedIdentitiesQuery,
  useIsArchivedPredicate,
} from "@/features/identity-archive/hooks";
import {
  externalRelayAgents,
  formatExternalAgentType,
  ownerManagedRelayAgents,
} from "@/features/agents/lib/externalAgentDirectory";
import { useCommunities } from "@/features/communities/useCommunities";
import { usePresenceQuery } from "@/features/presence/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import type { RelayAgent } from "@/shared/api/types";
import { PresenceBadge } from "@/features/presence/ui/PresenceBadge";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { AgentIdentityCard } from "./AgentIdentityCard";
import { ExternalAgentPresentationDialog } from "./ExternalAgentPresentationDialog";

export function RelayDirectorySection({
  error,
  isLoading,
  managedNames,
  managedPubkeys,
  onOpenAgentProfile,
  relayAgents,
}: {
  error: Error | null;
  isLoading: boolean;
  managedNames: Set<string>;
  managedPubkeys: Set<string>;
  onOpenAgentProfile: (pubkey: string) => void;
  relayAgents: RelayAgent[];
}) {
  const identityQuery = useIdentityQuery();
  const archivedIdentitiesQuery = useArchivedIdentitiesQuery();
  const isIdentityArchived = useIsArchivedPredicate();
  const { activeCommunity } = useCommunities();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [agentToCustomize, setAgentToCustomize] =
    React.useState<RelayAgent | null>(null);
  const currentPubkey = normalizePubkey(identityQuery.data?.pubkey ?? "");
  const presentationScope = externalAgentPresentationScope({
    identityPubkey: identityQuery.data?.pubkey,
    relayUrl: activeCommunity?.relayUrl,
  });

  // A side-by-side Desktop install intentionally keeps secrets isolated, but
  // the owner's relay-declared agents must still be visible and mentionable.
  // Runtime controls remain exclusively on the installation holding the key.
  const communityAgents = React.useMemo(
    () =>
      [
        // Owner-managed identity is pubkey-authoritative: do not pass local
        // names here, or a same-name sibling would hide Managed elsewhere.
        ...ownerManagedRelayAgents(relayAgents, managedPubkeys),
        ...externalRelayAgents(relayAgents, managedPubkeys, managedNames),
      ].filter((agent) => !isIdentityArchived(agent.pubkey)),
    [relayAgents, managedPubkeys, managedNames, isIdentityArchived],
  );
  const otherAgentPubkeys = React.useMemo(
    () => communityAgents.map((agent) => normalizePubkey(agent.pubkey)),
    [communityAgents],
  );
  const presenceQuery = usePresenceQuery(otherAgentPubkeys, {
    enabled: otherAgentPubkeys.length > 0,
  });

  const filteredAgents = React.useMemo(() => {
    if (!searchQuery.trim()) return communityAgents;
    const query = searchQuery.toLowerCase();
    return communityAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.agentType.toLowerCase().includes(query) ||
        agent.channels.some((ch) => ch.toLowerCase().includes(query)),
    );
  }, [communityAgents, searchQuery]);

  const sortedAgents = React.useMemo(
    () =>
      [...filteredAgents].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [filteredAgents],
  );

  // Archive state is part of relay-agent discovery, not optional decoration.
  // Rendering before it resolves flashes retired identities on cold launch;
  // failing open after an archive read error leaves those identities visible
  // indefinitely. Keep the directory withheld until the trusted snapshot is
  // available. AgentsView still derives persona suppression from the owner
  // declarations, so this gate cannot expose a local Start control.
  if (isLoading || archivedIdentitiesQuery.isPending) return null;

  if (archivedIdentitiesQuery.isError) {
    return (
      <p
        className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        data-testid="relay-directory-archive-error"
      >
        Community agents are hidden until archived identities can be verified.
      </p>
    );
  }

  if (communityAgents.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <button
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setIsExpanded((prev) => !prev)}
          type="button"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold tracking-tight">
            Agents in this community
          </h2>
          <span className="text-sm text-muted-foreground">
            ({communityAgents.length})
          </span>
        </button>
        <p className="pl-6 text-sm text-muted-foreground">
          Your agents from another Buzz installation and independently hosted
          agents. You can mention them here; runtime controls stay with their
          host.
        </p>
      </div>

      {isExpanded ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, type, or channel..."
              value={searchQuery}
            />
          </div>

          {sortedAgents.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">
              {searchQuery.trim()
                ? "No agents match your search."
                : "No other agents in this community."}
            </p>
          ) : (
            <div
              className="grid w-full grid-cols-[repeat(auto-fill,minmax(220px,240px))] justify-start gap-3"
              data-testid="relay-directory-cards"
            >
              {sortedAgents.map((agent) => {
                const canCustomize =
                  presentationScope !== null &&
                  normalizePubkey(agent.ownerPubkey ?? "") === currentPubkey;
                // kind:10100 is persistent directory metadata, not liveness.
                // External hosts publish live status as ephemeral kind:20001,
                // which is also the source used by DMs and profile surfaces.
                const liveStatus =
                  presenceQuery.data?.[normalizePubkey(agent.pubkey)] ??
                  "offline";
                return (
                  <AgentIdentityCard
                    actions={
                      canCustomize ? (
                        <Button
                          aria-label={`Customize ${agent.name}`}
                          className="h-8 w-8 rounded-full"
                          data-testid={`customize-external-agent-${agent.pubkey}`}
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
                    modelLabel={formatExternalAgentType(agent.agentType)}
                    onClick={() => onOpenAgentProfile(agent.pubkey)}
                    statusBadge={
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="info">
                          {agent.isOwnerManaged
                            ? "Managed elsewhere"
                            : "External"}
                        </Badge>
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
          )}
        </>
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
        scope={presentationScope}
      />
    </section>
  );
}
