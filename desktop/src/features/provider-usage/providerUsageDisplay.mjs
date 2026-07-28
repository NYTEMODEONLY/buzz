// @ts-check

/**
 * @param {number} remainingPercent
 * @returns {"healthy" | "warning" | "critical"}
 */
export function providerUsageTone(remainingPercent) {
  if (remainingPercent < 20) return "critical";
  if (remainingPercent <= 50) return "warning";
  return "healthy";
}

/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatTokenCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * @param {number | null | undefined} epochSeconds
 * @returns {string}
 */
export function formatUsageReset(epochSeconds) {
  if (typeof epochSeconds !== "number" || !Number.isFinite(epochSeconds)) {
    return "Reset unavailable";
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(epochSeconds * 1000));
}

/**
 * @typedef {"loading" | "ready" | "stale" | "authRequired" | "notInstalled" | "unavailable" | "error"} ProviderUsageViewState
 */

/**
 * Keep transport/query failures separate from ordinary capability gaps.
 * React Query retains the last successful snapshot during a failed refresh,
 * which lets the UI show useful stale data instead of replacing it with an
 * alarming empty state.
 *
 * @param {{
 *   availability?: string,
 *   error?: unknown,
 *   hasData?: boolean,
 *   isError?: boolean,
 *   isPending?: boolean,
 * }} input
 * @returns {ProviderUsageViewState}
 */
export function providerUsageViewState(input) {
  if (input.hasData) return input.isError ? "stale" : "ready";
  const errorCode =
    typeof input.error === "string" ? input.error : String(input.error ?? "");
  if (errorCode.includes("not_authenticated")) return "authRequired";
  if (errorCode.includes("not_installed")) return "notInstalled";
  if (
    errorCode.includes("usage_method_unavailable") ||
    errorCode.includes("team_usage_unsupported") ||
    errorCode.includes("usage_unsupported")
  ) {
    return "unavailable";
  }
  if (input.isPending && input.availability === "available") return "loading";
  if (input.availability === "not_authenticated") return "authRequired";
  if (input.availability === "not_installed") return "notInstalled";
  if (input.isError && input.availability === "available") return "error";
  return "unavailable";
}

/**
 * @param {unknown} error
 * @param {string} [provider]
 * @returns {string}
 */
export function providerUsageErrorMessage(error, provider = "provider") {
  const code = typeof error === "string" ? error : String(error ?? "");
  if (code.includes("codex_not_installed")) return "Codex is not installed";
  if (code.includes("codex_not_authenticated")) {
    return "Sign in with Codex to show usage";
  }
  if (code.includes("grok_not_installed")) return "Grok is not installed";
  if (code.includes("grok_not_authenticated")) {
    return "Sign in with Grok to show usage";
  }
  if (code.includes("grok_team_usage_unsupported")) {
    return "This Grok team account does not expose consumer allowance";
  }
  if (code.includes("grok_usage_method_unavailable")) {
    return "This Grok installation does not expose consumer allowance";
  }
  if (code.includes("protocol_unsupported")) {
    return `Update ${provider} to show usage`;
  }
  if (code.includes("response_too_large")) {
    return `${provider} returned an unsafe response`;
  }
  if (
    code.includes("invalid_response") ||
    code.includes("response_invalid") ||
    code.includes("parse_failed")
  ) {
    return `${provider} returned an unreadable usage response`;
  }
  return "Usage temporarily unavailable";
}
