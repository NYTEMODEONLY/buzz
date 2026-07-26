import { useQuery } from "@tanstack/react-query";
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
import {
  resolveProviderUsagePreference,
  useProviderUsagePreference,
} from "@/features/provider-usage/providerUsagePreference";

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
  const preference = useProviderUsagePreference();
  const capabilitiesQuery = useQuery({
    queryKey: ["provider-usage-capabilities"],
    queryFn: listProviderUsageCapabilities,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const provider = resolveProviderUsagePreference(
    preference,
    capabilitiesQuery.data,
  );
  const supported = provider === "codex";
  const query = useQuery({
    queryKey: ["provider-usage", provider],
    queryFn: () => getProviderUsage(provider),
    enabled: supported,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const compact = placement === "chrome";

  const usage = query.data;
  const constrainingWindow = usage?.windows.reduce((lowest, window) =>
    window.remainingPercent < lowest.remainingPercent ? window : lowest,
  );
  const remainingPercent = constrainingWindow?.remainingPercent;
  const tone =
    remainingPercent === undefined
      ? undefined
      : providerUsageTone(remainingPercent);
  const productLabel =
    provider === "codex" ? "Codex" : provider === "claude" ? "Claude" : "Grok";
  const planLabel =
    usage?.planType === undefined || usage.planType === null
      ? productLabel
      : `${productLabel} ${usage.planType.charAt(0).toUpperCase()}${usage.planType.slice(1)}`;
  const unsupportedMessage = supported
    ? null
    : `${productLabel} personal allowance is not supported yet`;
  const errorMessage = unsupportedMessage
    ? unsupportedMessage
    : query.isError
      ? providerUsageErrorMessage(query.error)
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={
            remainingPercent !== undefined
              ? `${planLabel}: ${remainingPercent}% remaining`
              : (errorMessage ?? `Loading ${productLabel} allowance`)
          }
          className={cn(
            "flex items-center gap-2 rounded-lg text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring",
            compact
              ? "ml-auto h-[28px] w-auto border-0 bg-transparent px-2 py-0"
              : "mb-2 w-full border border-sidebar-border/70 bg-sidebar-accent/35 px-2 py-2 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1",
          )}
          data-testid="sidebar-provider-usage"
          type="button"
        >
          <UsageRing
            compact={compact}
            isLoading={query.isPending && supported}
            label={productLabel}
            remainingPercent={remainingPercent}
          />
          <span
            className={cn(
              "min-w-0 flex-1",
              !compact && "group-data-[collapsible=icon]:hidden",
            )}
          >
            <span className="block truncate text-xs font-medium">
              {compact
                ? remainingPercent !== undefined
                  ? `${remainingPercent}% left`
                  : errorMessage
                    ? "Unavailable"
                    : "Checking…"
                : (errorMessage ?? planLabel)}
            </span>
            {!compact ? (
              <span
                className={cn(
                  "block truncate text-sm font-semibold tabular-nums",
                  tone ? toneClasses[tone].text : "text-muted-foreground",
                )}
              >
                {remainingPercent !== undefined
                  ? `${remainingPercent}% left`
                  : supported
                    ? "Checking allowance…"
                    : "Unavailable"}
              </span>
            ) : null}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80"
        side={compact ? "bottom" : "right"}
        sideOffset={10}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{planLabel}</p>
            <p className="text-xs text-muted-foreground">
              Personal subscription allowance
            </p>
          </div>
          {supported ? (
            <Button
              aria-label={`Refresh ${productLabel} allowance`}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(query.isFetching && "animate-spin")}
              />
            </Button>
          ) : null}
        </div>

        {usage && constrainingWindow ? (
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {constrainingWindow.remainingPercent}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {constrainingWindow.usedPercent}% used
                </span>
              </div>
              <Progress
                aria-label={`${constrainingWindow.remainingPercent}% remaining`}
                className={cn(
                  "h-2 bg-muted",
                  tone && toneClasses[tone].progress,
                )}
                value={constrainingWindow.remainingPercent}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {constrainingWindow.label} · Resets{" "}
                {formatUsageReset(constrainingWindow.resetsAt)}
              </p>
            </div>

            {usage.windows.length > 1 ? (
              <dl className="space-y-2 rounded-lg bg-muted/45 p-3 text-xs">
                {usage.windows.map((window) => (
                  <div
                    className="flex items-start justify-between gap-3"
                    key={window.id}
                  >
                    <dt className="text-muted-foreground">{window.label}</dt>
                    <dd className="text-right font-medium tabular-nums">
                      {window.remainingPercent}% left
                      <span className="block font-normal text-muted-foreground">
                        {formatUsageReset(window.resetsAt)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/45 p-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Latest daily usage</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {formatTokenCount(usage.totals.latestDailyTokens)} tokens
                </dd>
                {usage.totals.latestDailyDate ? (
                  <dd className="text-muted-foreground">
                    {usage.totals.latestDailyDate}
                  </dd>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">Lifetime usage</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {formatTokenCount(usage.totals.lifetimeTokens)} tokens
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Credit balance</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {usage.totals.creditBalance ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reset credits</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {usage.totals.resetCreditsAvailable ?? "—"}
                </dd>
              </div>
            </dl>

            <p className="text-2xs text-muted-foreground">
              Updated{" "}
              {new Date(usage.fetchedAt * 1000).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              {query.isError ? " · refresh failed; showing last result" : ""}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-muted/45 p-3 text-sm text-muted-foreground">
            {errorMessage ?? `Reading ${productLabel} allowance…`}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
