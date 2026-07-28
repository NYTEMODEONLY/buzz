import * as React from "react";
import {
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleHelp,
  Clock3,
  LockKeyhole,
  PackageX,
  RefreshCw,
} from "lucide-react";

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
  providerUsageViewState,
} from "@/features/provider-usage/providerUsageDisplay.mjs";
import { detectActiveProviderUsageIds } from "@/features/provider-usage/providerUsageProviders.mjs";
import { useManagedAgentsQuery } from "@/features/agents/hooks";
import type {
  ProviderUsageCapability,
  ProviderUsageId,
  ProviderUsageSnapshot,
} from "@/shared/api/tauriProviderUsage";

const FIVE_MINUTES = 5 * 60 * 1000;
type ProviderUsageViewState =
  | "loading"
  | "ready"
  | "stale"
  | "authRequired"
  | "notInstalled"
  | "unavailable"
  | "error";

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
  remainingPercent,
  state,
  label,
}: {
  compact?: boolean;
  remainingPercent?: number;
  state: ProviderUsageViewState;
  label: string;
}) {
  const sizeClass = compact ? "h-5 w-5" : "h-8 w-8";
  const iconClass = compact ? "h-3 w-3" : "h-4 w-4";

  if (state === "loading") {
    return <Spinner aria-hidden="true" className={cn(sizeClass, "border-2")} />;
  }
  if (remainingPercent === undefined) {
    const Icon =
      state === "authRequired"
        ? LockKeyhole
        : state === "notInstalled"
          ? PackageX
          : state === "error"
            ? AlertTriangle
            : CircleHelp;
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          sizeClass,
          state === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground",
        )}
        data-state={state}
      >
        <Icon aria-hidden="true" className={iconClass} />
      </span>
    );
  }

  const tone = providerUsageTone(remainingPercent);
  const circumference = 2 * Math.PI * 14;
  const dashOffset = circumference * (1 - remainingPercent / 100);
  return (
    <span
      className={cn(
        "relative shrink-0",
        sizeClass,
        state === "stale" && "opacity-60",
      )}
      aria-hidden="true"
      data-state={state}
    >
      <svg className={cn("-rotate-90", sizeClass)} viewBox="0 0 32 32">
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
      {state === "stale" ? (
        <Clock3 className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-sidebar text-amber-500" />
      ) : null}
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
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: true,
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
    const state = providerUsageViewState({
      availability: capability?.availability,
      error: query?.error,
      hasData: Boolean(usage),
      isError: Boolean(query?.isError),
      isPending: Boolean(query?.isPending),
    }) as ProviderUsageViewState;
    const errorMessage = supported
      ? query?.isError
        ? providerUsageErrorMessage(query.error, productLabel)
        : null
      : capabilityMessage(capability, productLabel);
    return {
      capability,
      constrainingWindow,
      errorMessage,
      productLabel,
      provider,
      query,
      state,
      supported,
      usage,
    };
  });
  const ariaSummary = rows
    .map((row) =>
      row.constrainingWindow
        ? `${row.productLabel}: ${row.constrainingWindow.remainingPercent}% left`
        : `${row.productLabel}: ${compactStatusLabel(row.state)}`,
    )
    .join("; ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={ariaSummary}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring",
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
                  label={row.productLabel}
                  remainingPercent={row.constrainingWindow?.remainingPercent}
                  state={row.state}
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
            <span
              className={cn(
                "block text-xs font-medium",
                compact && "whitespace-nowrap",
              )}
            >
              {compact
                ? rows
                    .map((row) =>
                      row.constrainingWindow
                        ? `${shortProviderLabel(row.provider)} ${row.constrainingWindow.remainingPercent}%`
                        : `${shortProviderLabel(row.provider)} ${compactValue(row.state)}`,
                    )
                    .join(" · ")
                : "AI provider allowance"}
            </span>
            {!compact ? (
              <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
                {rows.map((row) => (
                  <span className="whitespace-nowrap" key={row.provider}>
                    {row.productLabel}{" "}
                    {row.constrainingWindow
                      ? `${row.constrainingWindow.remainingPercent}%`
                      : compactValue(row.state)}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(28rem,calc(100vw-2rem))]"
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
  return provider === "codex"
    ? "Codex"
    : provider === "claude"
      ? "Claude"
      : "Grok";
}

function compactValue(state: ProviderUsageViewState): string {
  if (state === "loading") return "…";
  if (state === "error") return "!";
  return "—";
}

function compactStatusLabel(state: ProviderUsageViewState): string {
  if (state === "loading") return "loading";
  if (state === "authRequired") return "sign-in required";
  if (state === "notInstalled") return "not installed";
  if (state === "error") return "usage refresh failed";
  return "allowance unavailable";
}

function capabilityMessage(
  capability: ProviderUsageCapability | undefined,
  productLabel: string,
): string {
  if (!capability) return `${productLabel} capability is still loading`;
  if (capability.availability === "not_authenticated") {
    return `Sign in with ${productLabel} to show usage`;
  }
  if (capability.availability === "not_installed") {
    return `${productLabel} is not installed`;
  }
  return (
    capability.detail ??
    `${productLabel} does not expose a supported allowance reader`
  );
}

function ProviderAllowanceCard({
  constrainingWindow,
  errorMessage,
  productLabel,
  provider,
  query,
  state,
  supported,
  usage,
}: {
  constrainingWindow?: ProviderUsageSnapshot["windows"][number];
  errorMessage: string | null;
  productLabel: string;
  provider: ProviderUsageId;
  query: UseQueryResult<ProviderUsageSnapshot, Error> | undefined;
  state: ProviderUsageViewState;
  supported: boolean;
  usage?: ProviderUsageSnapshot;
}) {
  const tone = constrainingWindow
    ? providerUsageTone(constrainingWindow.remainingPercent)
    : undefined;
  const planLabel = usage?.planType
    ? `${productLabel} ${usage.planType.charAt(0).toUpperCase()}${usage.planType.slice(1)}`
    : productLabel;
  const sourceLabel = providerSourceLabel(usage);
  const totalsLabel = providerTotalsLabel(usage);
  const accountLabel =
    usage?.account?.label ??
    [usage?.account?.accountType, usage?.account?.loginMethod]
      .filter((value): value is string => Boolean(value))
      .join(" · ");

  return (
    <section
      className="rounded-lg border border-border/70 p-3"
      data-testid={`provider-allowance-card-${provider}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{planLabel}</p>
          <p className="text-2xs text-muted-foreground">
            {supported ? sourceLabel : "Allowance reader unavailable"}
          </p>
          {accountLabel ? (
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {accountLabel}
            </p>
          ) : null}
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
          {state === "stale" ? (
            <div
              className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-2xs text-amber-700 dark:text-amber-300"
              data-testid={`provider-usage-stale-${provider}`}
            >
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
              Last successful data shown; the latest refresh failed.
            </div>
          ) : null}
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
            {totalsLabel ? `${totalsLabel} · ` : ""}
            Updated{" "}
            {new Date(usage.fetchedAt * 1000).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <p className="text-2xs text-muted-foreground">
            {sourceLabel}
            {usage.dataConfidence === "percentOnly" ? " · Percentage only" : ""}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "mt-3 rounded-md p-2 text-xs",
            state === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted/45 text-muted-foreground",
          )}
          data-state={state}
          data-testid={`provider-usage-message-${provider}`}
        >
          {errorMessage ??
            (supported
              ? `Reading ${productLabel} allowance…`
              : "Remaining percentage and balance are not reported by this provider.")}
        </div>
      )}
    </section>
  );
}

function providerSourceLabel(usage: ProviderUsageSnapshot | undefined): string {
  if (usage?.sourceDetail === "codexAppServer") {
    return "Personal subscription allowance · Codex app-server";
  }
  if (usage?.sourceDetail === "grokCliBilling") {
    return "Grok Build consumer allowance · Local Grok CLI";
  }
  if (usage?.sourceDetail === "grokWebBilling") {
    return "Grok Build consumer allowance · Local Grok CLI account · Experimental reader";
  }
  return "Personal subscription allowance";
}

function providerTotalsLabel(
  usage: ProviderUsageSnapshot | undefined,
): string | null {
  if (!usage) return null;
  const values = [];
  if (usage.totals.creditBalance !== null) {
    values.push(`Credits ${usage.totals.creditBalance}`);
  }
  if (usage.totals.latestDailyTokens !== null) {
    values.push(
      `Daily ${formatTokenCount(usage.totals.latestDailyTokens)} tokens`,
    );
  }
  return values.length > 0 ? values.join(" · ") : null;
}
