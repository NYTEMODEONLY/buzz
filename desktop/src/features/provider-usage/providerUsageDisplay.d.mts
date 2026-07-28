export type ProviderUsageTone = "healthy" | "warning" | "critical";

export function providerUsageTone(remainingPercent: number): ProviderUsageTone;

export function formatTokenCount(value: number | null | undefined): string;

export function formatUsageReset(
  epochSeconds: number | null | undefined,
): string;

export type ProviderUsageViewState =
  | "loading"
  | "ready"
  | "stale"
  | "authRequired"
  | "notInstalled"
  | "unavailable"
  | "error";

export function providerUsageViewState(input: {
  availability?: string;
  error?: unknown;
  hasData?: boolean;
  isError?: boolean;
  isPending?: boolean;
}): ProviderUsageViewState;

export function providerUsageErrorMessage(
  error: unknown,
  provider?: string,
): string;
