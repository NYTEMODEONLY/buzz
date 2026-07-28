import { useQuery } from "@tanstack/react-query";
import { Check, CircleSlash2 } from "lucide-react";

import {
  listProviderUsageCapabilities,
  type ProviderUsageCapability,
} from "@/shared/api/tauriProviderUsage";
import { cn } from "@/shared/lib/cn";

const FALLBACK_CAPABILITIES: ProviderUsageCapability[] = [
  {
    id: "codex",
    name: "Codex",
    availability: "temporarily_unavailable",
    detail: "Local capability check unavailable",
  },
  {
    id: "claude",
    name: "Claude",
    availability: "unsupported",
    detail: "No supported standalone personal allowance reader yet",
  },
  {
    id: "grok",
    name: "Grok",
    availability: "unsupported",
    detail: "Consumer allowance is available in Grok Settings",
  },
];

function ProviderChoice({
  capability,
}: {
  capability: ProviderUsageCapability;
}) {
  const available = capability.availability === "available";
  return (
    <div
      className={cn(
        "flex min-h-20 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        available
          ? "border-primary/40 bg-primary/5"
          : "border-border/70 bg-background",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          available && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {available ? (
          <Check aria-hidden="true" className="h-3 w-3" />
        ) : (
          <CircleSlash2 aria-hidden="true" className="h-3 w-3" />
        )}
      </span>
      <span>
        <span className="block text-sm font-medium">{capability.name}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {available ? "Allowance available" : capability.detail}
        </span>
      </span>
    </div>
  );
}

export function ProviderUsageExperimentSettings({
  enabled,
}: {
  enabled: boolean;
}) {
  const capabilitiesQuery = useQuery({
    queryKey: ["provider-usage-capabilities"],
    queryFn: listProviderUsageCapabilities,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const capabilities = capabilitiesQuery.data ?? FALLBACK_CAPABILITIES;

  if (!enabled) return null;

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Provider coverage
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {capabilities.map((capability) => (
          <ProviderChoice capability={capability} key={capability.id} />
        ))}
      </div>
      <p className="mt-2 text-2xs text-muted-foreground">
        Buzz automatically shows every provider used by active agents. Numeric
        remaining allowance appears only when the provider exposes a supported
        personal-allowance reader. No credentials or raw responses are stored or
        published to Nostr.
      </p>
    </div>
  );
}
