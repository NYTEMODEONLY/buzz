import * as React from "react";
import {
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";

import {
  getProviderUsage,
  listProviderUsageCapabilities,
} from "@/shared/api/tauriProviderUsage";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Progress } from "@/shared/ui/progress";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/cn";
import {
  formatTokenCount,
  formatUsageReset,
  providerUsageErrorMessage,
  providerUsageTone,
} from "@/features/provider-usage/providerUsageDisplay.mjs";
import { detectActiveProviderUsageIds } from "@/features/provider-usage/providerUsageProviders.mjs";
import { useManagedAgentsQuery } from "@/features/agents/hooks";
import type {
  ProviderUsageCapability,
  ProviderUsageId,
  ProviderUsageSnapshot,
} from "@/shared/api/tauriProviderUsage";

const FIVE_MINUTES = 5 * 60 * 1000;

const toneClasses = {
  healthy: {
    stroke: "stroke-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    progress: "[&>div]:bg-emerald-500",
  },
  warning: {
    stroke: "stroke-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    progress: "[&>div]:bg-amber-500",
  },
  critical: {
    stroke: "stroke-red-500",
    text: "text-red-600 dark:text-red-400",
    progress: "[&>div]:bg-red-500",
  },
} as const;

function UsageRing({
  compact = false,
  isLoading,
  remainingPercent,
  label,
}: {
  compact?: boolean;
  isLoading: boolean;
  remainingPercent?: number;
  label: string;
}) {
  if (isLoading) {
    return (
      <Spinner
        aria-hidden="true"
        className={cn(compact ? "h-5 w-5" : "h-8 w-8", "border-2")}
      />
    );
  }
  if (remainingPercent === undefined) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-destructive/10 text-destructive",
          compact ? "h-5 w-5" : "h-8 w-8",
        )}
      >
        <AlertTriangle
          aria-hidden="true"
          className={compact ? "h-3 w-3" : "h-4 w-4"}
        />
      </span>
    );
  }

  const tone = providerUsageTone(remainingPercent);
  const circumference = 2 * Math.PI * 14;
  const dashOffset = circumference * (1 - remainingPercent / 100);
  return (
    <span
      className={cn("relative shrink-0", compact ? "h-5 w-5" : "h-8 w-8")}
      aria-hidden="true"
    >
      <svg
        className={cn("-rotate-90", compact ? "h-5 w-5" : "h-8 w-8")}
        viewBox="0 0 32 32"
      >
        <title>{label} allowance remaining</title>
        <circle
          className="stroke-muted"
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeWidth="3"
        />
        <circle
          className={cn(
            "transition-[stroke-dashoffset] duration-300",
            toneClasses[tone].stroke,
          )}
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
    </span>
  );
}

export function SidebarProviderUsageIndicator({
  placement = "sidebar",
}: {
  placement?: "chrome" | "sidebar";
}) {
  const agentsQuery = useManagedAgentsQuery();
  const capabilitiesQuery = useQuery({
    queryKey: ["provider-usage-capabilities"],
    queryFn: listProviderUsageCapabilities,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const capabilities = capabilitiesQuery.data ?? [];
  const activeProviders = React.useMemo(
    () => detectActiveProviderUsageIds(agentsQuery.data ?? [], capabilities),
    [agentsQuery.data, capabilities],
  );
  const capabilityByProvider = React.useMemo(
    () =>
      new Map(
        capabilities.map((capability) => [capability.id, capability] as const),
      ),
    [capabilities],
  );
  const providerQueries = useQueries({
    queries: activeProviders.map((provider) => ({
      queryKey: ["provider-usage", provider],
      queryFn: () => getProviderUsage(provider),
      enabled: capabilityByProvider.get(provider)?.availability === "available",
      staleTime: FIVE_MINUTES,
      refetchInterval: FIVE_MINUTES,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: 1,
    })),
  });
  const compact = placement === "chrome";

  const rows = activeProviders.map((provider, index) => {
    const capability = capabilityByProvider.get(provider);
    const query = providerQueries[index];
    const usage = query?.data;
    const constrainingWindow = usage?.windows.reduce((lowest, window) =>
      window.remainingPercent < lowest.remainingPercent ? window : lowest,
    );
    const productLabel = providerLabel(provider);
    const supported = capability?.availability === "available";
    const errorMessage = supported
      ? query?.isError
        ? providerUsageErrorMessage(query.error)
        : null
      : (capability?.detail ??
        `${productLabel} does not expose a supported allowance reader`);
    return {
      capability,
      constrainingWindow,
      errorMessage,
      productLabel,
      provider,
      query,
      supported,
      usage,
    };
  });
  const ariaSummary = rows
    .map((row) =>
      row.constrainingWindow
        ? `${row.productLabel}: ${row.constrainingWindow.remainingPercent}% left`
        : `${row.productLabel}: allowance unavailable`,
    )
    .join("; ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={ariaSummary}
          className={cn(
            "flex items-center gap-2 rounded-lg text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring",
            compact
              ? "ml-auto h-[28px] w-auto border-0 bg-transparent px-2 py-0"
              : "mb-2 w-full border border-sidebar-border/70 bg-sidebar-accent/35 px-2 py-2 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1",
          )}
          data-testid="sidebar-provider-usage"
          type="button"
        >
          <span className="flex shrink-0 items-center -space-x-1">
            {rows.map((row) => (
              <span
                className="rounded-full bg-sidebar"
                data-testid={`provider-usage-${row.provider}`}
                key={row.provider}
              >
                <UsageRing
                  compact={compact}
                  isLoading={Boolean(row.query?.isPending && row.supported)}
                  label={row.productLabel}
                  remainingPercent={row.constrainingWindow?.remainingPercent}
                />
              </span>
            ))}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1",
              !compact && "group-data-[collapsible=icon]:hidden",
            )}
          >
            <span className="block truncate text-xs font-medium">
              {compact
                ? rows
                    .map((row) =>
                      row.constrainingWindow
                        ? `${shortProviderLabel(row.provider)} ${row.constrainingWindow.remainingPercent}%`
                        : `${shortProviderLabel(row.provider)} —`,
                    )
                    .join(" · ")
                : "AI provider allowance"}
            </span>
            {!compact ? (
              <span className="block truncate text-sm font-semibold tabular-nums text-muted-foreground">
                {rows
                  .map((row) =>
                    row.constrainingWindow
                      ? `${row.productLabel} ${row.constrainingWindow.remainingPercent}%`
                      : `${row.productLabel} —`,
                  )
                  .join(" · ")}
              </span>
            ) : null}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-96"
        side={compact ? "bottom" : "right"}
        sideOffset={10}
      >
        <div>
          <p className="font-semibold">AI provider allowance</p>
          <p className="text-xs text-muted-foreground">
            All providers used by active agents
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <ProviderAllowanceCard key={row.provider} {...row} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function providerLabel(provider: ProviderUsageId): string {
  return provider === "codex"
    ? "Codex"
    : provider === "claude"
      ? "Claude"
      : "Grok";
}

function shortProviderLabel(provider: ProviderUsageId): string {
  return provider === "codex" ? "OAI" : provider === "claude" ? "ANT" : "XAI";
}

function ProviderAllowanceCard({
  capability,
  constrainingWindow,
  errorMessage,
  productLabel,
  provider,
  query,
  supported,
  usage,
}: {
  capability?: ProviderUsageCapability;
  constrainingWindow?: ProviderUsageSnapshot["windows"][number];
  errorMessage: string | null;
  productLabel: string;
  provider: ProviderUsageId;
  query: UseQueryResult<ProviderUsageSnapshot, Error> | undefined;
  supported: boolean;
  usage?: ProviderUsageSnapshot;
}) {
  const tone = constrainingWindow
    ? providerUsageTone(constrainingWindow.remainingPercent)
    : undefined;
  const planLabel = usage?.planType
    ? `${productLabel} ${usage.planType.charAt(0).toUpperCase()}${usage.planType.slice(1)}`
    : productLabel;

  return (
    <section
      className="rounded-lg border border-border/70 p-3"
      data-testid={`provider-allowance-card-${provider}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{planLabel}</p>
          <p className="text-2xs text-muted-foreground">
            {supported
              ? "Personal subscription allowance"
              : (capability?.detail ?? "Allowance reader unavailable")}
          </p>
        </div>
        {supported ? (
          <Button
            aria-label={`Refresh ${productLabel} allowance`}
            disabled={query?.isFetching}
            onClick={() => void query?.refetch()}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(query?.isFetching && "animate-spin")}
            />
          </Button>
        ) : null}
      </div>
      {usage && constrainingWindow ? (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xl font-semibold tabular-nums">
                {constrainingWindow.remainingPercent}% left
              </span>
              <span className="text-xs text-muted-foreground">
                {constrainingWindow.usedPercent}% used
              </span>
            </div>
            <Progress
              aria-label={`${productLabel}: ${constrainingWindow.remainingPercent}% remaining`}
              className={cn("h-2 bg-muted", tone && toneClasses[tone].progress)}
              value={constrainingWindow.remainingPercent}
            />
            <p className="mt-2 text-2xs text-muted-foreground">
              {constrainingWindow.label} · Resets{" "}
              {formatUsageReset(constrainingWindow.resetsAt)}
            </p>
          </div>
          {usage.windows.length > 1 ? (
            <dl className="space-y-1.5 rounded-md bg-muted/45 p-2 text-2xs">
              {usage.windows.map((window) => (
                <div
                  className="flex items-start justify-between gap-3"
                  key={window.id}
                >
                  <dt className="text-muted-foreground">{window.label}</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {window.remainingPercent}% left ·{" "}
                    {formatUsageReset(window.resetsAt)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="text-2xs text-muted-foreground">
            Credits {usage.totals.creditBalance ?? "—"} · Daily{" "}
            {formatTokenCount(usage.totals.latestDailyTokens)} tokens · Updated{" "}
            {new Date(usage.fetchedAt * 1000).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
          {errorMessage ??
            (supported
              ? `Reading ${productLabel} allowance…`
              : "Remaining percentage and balance are not reported by this provider.")}
        </div>
      )}
    </section>
  );
}
