export const NYTEMODE_CANARY_DISTRIBUTION = "nytemode-canary";
export const NYTEMODE_URL = "https://nytemode.com";
export const UPSTREAM_RELEASES_URL =
  "https://github.com/block/buzz/releases/latest";
export const NYTEMODE_CANARY_RELEASES_URL =
  "https://github.com/NYTEMODEONLY/buzz/releases/latest";

export function isNytemodeCanaryDistribution(
  distribution: string | undefined,
): boolean {
  return distribution === NYTEMODE_CANARY_DISTRIBUTION;
}

export const isNytemodeCanary = isNytemodeCanaryDistribution(
  import.meta.env?.VITE_BUZZ_DISTRIBUTION,
);

export function releasesUrlForDistribution(
  distribution: string | undefined,
): string {
  return isNytemodeCanaryDistribution(distribution)
    ? NYTEMODE_CANARY_RELEASES_URL
    : UPSTREAM_RELEASES_URL;
}

export const distributionReleasesUrl = releasesUrlForDistribution(
  import.meta.env?.VITE_BUZZ_DISTRIBUTION,
);
