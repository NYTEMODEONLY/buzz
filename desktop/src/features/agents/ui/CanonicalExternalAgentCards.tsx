import {
  CANONICAL_EXTERNAL_AGENTS,
  externalAgentPresentationScope,
  formatExternalAgentRuntimeLabel,
  useExternalAgentPresentations,
} from "@/features/agents/externalAgentPresentation";
import { useCommunities } from "@/features/communities/useCommunities";
import { useIsArchivedPredicate } from "@/features/identity-archive/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { AgentIdentityCard } from "./AgentIdentityCard";

export function CanonicalExternalAgentCards({
  onOpenAgentProfile,
}: {
  onOpenAgentProfile: (pubkey: string) => void;
}) {
  const identityQuery = useIdentityQuery();
  const { activeCommunity } = useCommunities();
  const presentationScope = externalAgentPresentationScope({
    identityPubkey: identityQuery.data?.pubkey,
    relayUrl: activeCommunity?.relayUrl,
  });
  const presentations = useExternalAgentPresentations(presentationScope);
  const isArchived = useIsArchivedPredicate();

  return CANONICAL_EXTERNAL_AGENTS.filter(
    (agent) => !isArchived(agent.pubkey),
  ).map((agent) => {
    const presentation = presentations[agent.pubkey] ?? null;
    const label = presentation?.displayName ?? agent.fallbackName;
    const modelLabel =
      formatExternalAgentRuntimeLabel(presentation?.runtimeLabel) ??
      agent.runtimeLabel;

    return (
      <AgentIdentityCard
        ariaLabel={`${label} agent profile`}
        avatarUrl={presentation?.avatarUrl}
        dataTestId={`canonical-external-agent-card-${agent.pubkey}`}
        key={agent.pubkey}
        label={label}
        modelLabel={modelLabel}
        onClick={() => onOpenAgentProfile(agent.pubkey)}
      />
    );
  });
}
