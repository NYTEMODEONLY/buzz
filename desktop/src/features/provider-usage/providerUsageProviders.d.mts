import type {
  ProviderUsageCapability,
  ProviderUsageId,
} from "../../shared/api/tauriProviderUsage";

type ProviderAgent = {
  status?: string | null;
  provider?: string | null;
  runtime?: string | null;
  agentCommand?: string | null;
  acpCommand?: string | null;
  model?: string | null;
};

export const PROVIDER_USAGE_ORDER: ProviderUsageId[];

export function detectActiveProviderUsageIds(
  agents?: ProviderAgent[],
  capabilities?: ProviderUsageCapability[],
): ProviderUsageId[];

