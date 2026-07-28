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
    progress: "[&>div]:bg-primary",
    sidebarStroke: "stroke-sidebar-primary",
  },
  warning: {
    progress: "[&>div]:bg-warning",
    sidebarStroke: "stroke-warning",
  },
  critical: {
    progress: "[&>div]:bg-destructive",
    sidebarStroke: "stroke-destructive",
  },
} as const;

function UsageRing({
  remainingPercent,
  size,
  state,
}: {
  remainingPercent?: number;
  size: "chrome" | "settings";
  state: ProviderUsageViewState;
}) {
  const sizeClass = "h-[18px] w-[18px]";
  const iconClass = size === "chrome" ? "h-2.5 w-2.5" : "h-3 w-3";

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
          "flex shrink-0 items-center justify-center rounded-full",
          sizeClass,
          state === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-sidebar-accent text-sidebar-foreground/65",
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
      <svg
        aria-hidden="true"
        className={cn("-rotate-90", sizeClass)}
        viewBox="0 0 32 32"
      >
        <circle
          className="stroke-sidebar-border/70"
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeWidth="3"
        />
        <circle
          className={cn(
            "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300",
            toneClasses[tone].sidebarStroke,
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
        <Clock3 className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-sidebar-accent text-warning" />
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
  const popoverTitleId = React.useId();
  const popoverDescriptionId = React.useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <ChromeUsageTrigger ariaSummary={ariaSummary} rows={rows} />
        ) : (
          <SettingsUsageTrigger ariaSummary={ariaSummary} rows={rows} />
        )}
      </PopoverTrigger>

      <PopoverContent
        aria-describedby={popoverDescriptionId}
        aria-labelledby={popoverTitleId}
        align="end"
        className="max-h-[min(38rem,var(--radix-popover-content-available-height))] w-[min(25rem,var(--radix-popover-content-available-width),calc(100vw-1.5rem))] overflow-y-auto overscroll-contain p-3"
        collisionPadding={12}
        role="dialog"
        side={compact ? "bottom" : "right"}
        sideOffset={compact ? 10 : 14}
      >
        <div className="px-0.5">
          <h2 className="text-sm font-semibold" id={popoverTitleId}>
            AI usage
          </h2>
          <p
            className="mt-0.5 text-2xs text-muted-foreground"
            id={popoverDescriptionId}
          >
            {rows.length} {rows.length === 1 ? "provider" : "providers"} used by
            active agents
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <ProviderAllowanceCard key={row.provider} {...row} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ProviderUsageRow = {
  capability: ProviderUsageCapability | undefined;
  constrainingWindow: ProviderUsageSnapshot["windows"][number] | undefined;
  errorMessage: string | null;
  productLabel: string;
  provider: ProviderUsageId;
  query: UseQueryResult<ProviderUsageSnapshot, Error> | undefined;
  state: ProviderUsageViewState;
  supported: boolean;
  usage: ProviderUsageSnapshot | undefined;
};

type UsageTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ariaSummary: string;
  rows: ProviderUsageRow[];
};

const ChromeUsageTrigger = React.forwardRef<
  HTMLButtonElement,
  UsageTriggerProps
>(function ChromeUsageTrigger(
  { ariaSummary, className, rows, ...triggerProps },
  ref,
) {
  return (
    <button
      {...triggerProps}
      aria-label={`Open AI usage details. ${ariaSummary}`}
      className={cn(
        "ml-auto flex h-[28px] min-w-0 max-w-[min(30rem,calc(100vw-9rem))] shrink items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring",
        className,
      )}
      data-testid="sidebar-provider-usage"
      ref={ref}
      type="button"
    >
      {rows.map((row) => (
        <span
          className="flex min-w-0 shrink items-center gap-1 whitespace-nowrap text-xs font-medium tabular-nums"
          data-testid={`provider-usage-${row.provider}`}
          key={row.provider}
        >
          <UsageRing
            remainingPercent={row.constrainingWindow?.remainingPercent}
            size="chrome"
            state={row.state}
          />
          <span className="max-[900px]:hidden">{row.productLabel}</span>
          <span className="hidden max-[900px]:inline" aria-hidden="true">
            {narrowProviderLabel(row.provider)}
          </span>{" "}
          <span>
            {row.constrainingWindow
              ? `${row.constrainingWindow.remainingPercent}%`
              : compactValue(row.state)}
          </span>
        </span>
      ))}
    </button>
  );
});

const SettingsUsageTrigger = React.forwardRef<
  HTMLButtonElement,
  UsageTriggerProps
>(function SettingsUsageTrigger(
  { ariaSummary, className, rows, ...triggerProps },
  ref,
) {
  return (
    <button
      {...triggerProps}
      aria-label={`Open AI usage details. ${ariaSummary}`}
      className={cn(
        "mb-2 w-full rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 px-2 py-1.5 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent/55 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1",
        className,
      )}
      data-testid="sidebar-provider-usage"
      ref={ref}
      type="button"
    >
      {rows[0] ? (
        <span className="hidden group-data-[collapsible=icon]:block">
          <UsageRing
            remainingPercent={rows[0].constrainingWindow?.remainingPercent}
            size="settings"
            state={rows[0].state}
          />
        </span>
      ) : null}
      <span className="block text-2xs font-medium text-sidebar-foreground/65 group-data-[collapsible=icon]:hidden">
        AI usage
      </span>
      <span className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 group-data-[collapsible=icon]:hidden">
        {rows.map((row) => (
          <span
            className="flex min-w-[5.125rem] flex-1 items-center gap-0.5 text-xs font-semibold tabular-nums"
            data-testid={`provider-usage-${row.provider}`}
            key={row.provider}
          >
            <UsageRing
              remainingPercent={row.constrainingWindow?.remainingPercent}
              size="settings"
              state={row.state}
            />
            <span className="min-w-0 truncate">{row.productLabel}</span>{" "}
            <span className="ml-auto shrink-0">
              {row.constrainingWindow
                ? `${row.constrainingWindow.remainingPercent}%`
                : compactValue(row.state)}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
});

function providerLabel(provider: ProviderUsageId): string {
  return provider === "codex"
    ? "Codex"
    : provider === "claude"
      ? "Claude"
      : "Grok";
}

function narrowProviderLabel(provider: ProviderUsageId): string {
  return provider === "codex" ? "C" : provider === "claude" ? "Cl" : "G";
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
  const totalsLabel = providerTotalsLabel(usage);
  const accountLabel =
    usage?.account?.label ??
    [usage?.account?.accountType, usage?.account?.loginMethod]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
  const headingId = React.useId();
  const [refreshNotice, setRefreshNotice] = React.useState("");
  const additionalWindows =
    usage?.windows.filter((window) => window.id !== constrainingWindow?.id) ??
    [];

  async function refreshAllowance() {
    setRefreshNotice("");
    const result = await query?.refetch();
    setRefreshNotice(
      result?.isSuccess
        ? `${productLabel} allowance updated.`
        : `${productLabel} allowance could not be updated.`,
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border/70 p-2.5"
      data-testid={`provider-allowance-card-${provider}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" id={headingId}>
            {planLabel}
          </h3>
          {accountLabel ? (
            <p className="mt-0.5 truncate text-2xs text-muted-foreground">
              {accountLabel}
            </p>
          ) : null}
        </div>
        {supported ? (
          <Button
            aria-label={`Refresh ${productLabel} allowance`}
            disabled={query?.isFetching}
            onClick={() => void refreshAllowance()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(query?.isFetching && "motion-safe:animate-spin")}
            />
          </Button>
        ) : null}
      </div>
      <span aria-live="polite" className="sr-only" role="status">
        {refreshNotice}
      </span>
      {usage && constrainingWindow ? (
        <div className="mt-2.5 space-y-2.5">
          {state === "stale" ? (
            <div
              className="flex items-center gap-1.5 rounded-md bg-warning-bg px-2 py-1.5 text-2xs text-warning"
              data-testid={`provider-usage-stale-${provider}`}
            >
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
              Last successful data shown; the latest refresh failed.
            </div>
          ) : null}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-lg font-semibold tabular-nums">
                {constrainingWindow.remainingPercent}% remaining
              </span>
              <span className="text-xs text-muted-foreground">
                {constrainingWindow.usedPercent}% used
              </span>
            </div>
            <Progress
              aria-label={`${productLabel}: ${constrainingWindow.remainingPercent}% remaining`}
              aria-valuetext={`${constrainingWindow.remainingPercent}% remaining for ${constrainingWindow.label}; resets ${formatUsageReset(constrainingWindow.resetsAt)}`}
              className={cn(
                "h-1.5 bg-muted [&>div]:motion-reduce:transition-none",
                tone && toneClasses[tone].progress,
              )}
              value={constrainingWindow.remainingPercent}
            />
            <p className="mt-1.5 text-2xs text-muted-foreground">
              {constrainingWindow.label} · Resets{" "}
              {formatUsageReset(constrainingWindow.resetsAt)}
            </p>
          </div>
          {additionalWindows.length > 0 ? (
            <dl className="space-y-1.5 rounded-md bg-muted/45 p-2 text-2xs">
              {additionalWindows.map((window) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5"
                  key={window.id}
                >
                  <dt className="min-w-0 truncate text-muted-foreground">
                    {window.label}
                  </dt>
                  <dd className="text-right font-medium tabular-nums">
                    {window.remainingPercent}% remaining
                  </dd>
                  <dd className="col-span-2 text-muted-foreground">
                    Resets {formatUsageReset(window.resetsAt)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-border/50 pt-2 text-2xs text-muted-foreground">
            <span>{providerSourceMetadata(usage)}</span>
            {totalsLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{totalsLabel}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>
              Updated{" "}
              {new Date(usage.fetchedAt * 1000).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {usage.dataConfidence === "percentOnly" ? (
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/75">
                Percentage only
              </span>
            ) : null}
          </div>
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

function providerSourceMetadata(
  usage: ProviderUsageSnapshot | undefined,
): string {
  if (usage?.sourceDetail === "codexAppServer") {
    return "Personal · Codex app-server";
  }
  if (usage?.sourceDetail === "grokCliBilling") {
    return "Grok Build · Local CLI";
  }
  if (usage?.sourceDetail === "grokWebBilling") {
    return "Grok Build · Local CLI account · Experimental";
  }
  return providerSourceLabel(usage);
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
