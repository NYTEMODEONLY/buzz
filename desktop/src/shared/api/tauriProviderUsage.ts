import { invoke } from "@tauri-apps/api/core";

export type CodexProviderUsage = {
  provider: "openai";
  planType: string | null;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
  windowDurationMinutes: number | null;
  creditBalance: string | null;
  resetCreditsAvailable: number | null;
  lifetimeTokens: number | null;
  latestDailyTokens: number | null;
  latestDailyDate: string | null;
  fetchedAt: number;
};

export function getCodexProviderUsage(): Promise<CodexProviderUsage> {
  return invoke<CodexProviderUsage>("get_codex_provider_usage");
}
