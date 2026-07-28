export const PROVIDER_USAGE_ORDER = ["codex", "claude", "grok"];

function providerFromText(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes("grok") ||
    normalized.includes("xai") ||
    normalized.includes("x.ai")
  ) {
    return "grok";
  }
  if (normalized.includes("claude") || normalized.includes("anthropic")) {
    return "claude";
  }
  if (
    normalized.includes("codex") ||
    normalized.includes("openai") ||
    normalized.includes("chatgpt")
  ) {
    return "codex";
  }
  return null;
}

/**
 * Returns every allowance provider used by a running/deployed local agent.
 * When agent metadata is still loading or inherited configuration contains no
 * provider hint, available local readers remain visible instead of making the
 * global indicator disappear.
 */
export function detectActiveProviderUsageIds(agents = [], capabilities = []) {
  const detected = new Set();
  for (const agent of agents) {
    if (agent?.status !== "running" && agent?.status !== "deployed") continue;
    for (const value of [
      agent.provider,
      agent.runtime,
      agent.agentCommand,
      agent.acpCommand,
      agent.model,
    ]) {
      const provider = providerFromText(value);
      if (provider) detected.add(provider);
    }
  }

  if (detected.size === 0) {
    for (const capability of capabilities) {
      if (capability?.availability === "available") {
        detected.add(capability.id);
      }
    }
  }
  if (detected.size === 0) detected.add("codex");

  return PROVIDER_USAGE_ORDER.filter((provider) => detected.has(provider));
}
