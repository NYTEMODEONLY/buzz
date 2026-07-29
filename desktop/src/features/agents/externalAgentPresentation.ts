import * as React from "react";

import type {
  Profile,
  UserProfileSummary,
  UsersBatchResponse,
} from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

const STORAGE_PREFIX = "buzz.external-agent-presentations.v1";
const CHANGE_EVENT = "buzz-external-agent-presentations-changed";

/**
 * NYTEMODE's externally hosted agent boundary.
 *
 * These identities are selected by exact public key, never by display name.
 * They remain outside the local managed-agent store so Desktop cannot replace
 * their runtime, key, memory, provider, skills, or lifecycle.
 */
export const CANONICAL_EXTERNAL_AGENTS = [
  {
    pubkey: "a0456f8689529792012deec933d7bbdfc8310ae766bd5d8e37df31bf4e14757d",
    fallbackName: "ALICE",
    runtimeLabel: "HERMES",
  },
] as const;

export const CANONICAL_EXTERNAL_AGENT_PUBKEYS = new Set(
  CANONICAL_EXTERNAL_AGENTS.map((agent) => agent.pubkey),
);

export function getCanonicalAgentPubkeys(managedPubkeys: ReadonlySet<string>) {
  return new Set([...managedPubkeys, ...CANONICAL_EXTERNAL_AGENT_PUBKEYS]);
}

export type ExternalAgentPresentation = {
  displayName: string | null;
  avatarUrl: string | null;
  about: string | null;
  runtimeLabel: string | null;
};

export type ExternalAgentPresentations = Record<
  string,
  ExternalAgentPresentation
>;

const EMPTY_PRESENTATIONS: ExternalAgentPresentations = Object.freeze({});
let cachedStorageKey = "";
let cachedRawValue: string | null = null;
let cachedPresentations = EMPTY_PRESENTATIONS;

export function externalAgentPresentationScope({
  identityPubkey,
  relayUrl,
}: {
  identityPubkey: string | null | undefined;
  relayUrl: string | null | undefined;
}): string | null {
  const owner = identityPubkey?.trim().toLowerCase();
  const relay = relayUrl?.trim().toLowerCase();
  return owner && relay ? `${owner}:${relay}` : null;
}

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}:${scope}`;
}

function normalizedOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function parsePresentations(raw: string | null): ExternalAgentPresentations {
  if (!raw) return EMPTY_PRESENTATIONS;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY_PRESENTATIONS;
    }

    const presentations: ExternalAgentPresentations = {};
    for (const [pubkey, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      presentations[normalizePubkey(pubkey)] = {
        displayName: normalizedOptionalString(record.displayName),
        avatarUrl: normalizedOptionalString(record.avatarUrl),
        about: normalizedOptionalString(record.about),
        runtimeLabel: normalizedOptionalString(record.runtimeLabel),
      };
    }
    return presentations;
  } catch {
    return EMPTY_PRESENTATIONS;
  }
}

export function resetExternalAgentPresentationCache(): void {
  cachedStorageKey = "";
  cachedRawValue = null;
  cachedPresentations = EMPTY_PRESENTATIONS;
}

export function readExternalAgentPresentations(
  scope: string | null,
): ExternalAgentPresentations {
  if (!scope || typeof window === "undefined") return EMPTY_PRESENTATIONS;

  const key = storageKey(scope);
  const raw = window.localStorage.getItem(key);
  if (key === cachedStorageKey && raw === cachedRawValue) {
    return cachedPresentations;
  }

  cachedStorageKey = key;
  cachedRawValue = raw;
  cachedPresentations = parsePresentations(raw);
  return cachedPresentations;
}

export function saveExternalAgentPresentation(
  scope: string,
  pubkey: string,
  presentation: ExternalAgentPresentation | null,
): void {
  if (typeof window === "undefined") return;

  const key = storageKey(scope);
  const current = { ...readExternalAgentPresentations(scope) };
  const normalizedPubkey = normalizePubkey(pubkey);
  if (presentation) {
    current[normalizedPubkey] = {
      displayName: presentation.displayName?.trim() || null,
      avatarUrl: presentation.avatarUrl?.trim() || null,
      about: presentation.about?.trim() || null,
      runtimeLabel: presentation.runtimeLabel?.trim() || null,
    };
  } else {
    delete current[normalizedPubkey];
  }

  const raw = Object.keys(current).length > 0 ? JSON.stringify(current) : null;
  if (raw === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, raw);

  cachedStorageKey = key;
  cachedRawValue = raw;
  cachedPresentations =
    Object.keys(current).length > 0 ? current : EMPTY_PRESENTATIONS;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { scope } }));
}

function subscribe(scope: string | null, onStoreChange: () => void) {
  if (!scope || typeof window === "undefined") return () => {};
  const key = storageKey(scope);
  const handleChange = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== key) return;
    if (
      event instanceof CustomEvent &&
      (event.detail as { scope?: unknown } | null)?.scope !== scope
    ) {
      return;
    }
    resetExternalAgentPresentationCache();
    onStoreChange();
  };
  window.addEventListener("storage", handleChange);
  window.addEventListener(CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
}

export function useExternalAgentPresentations(scope: string | null) {
  return React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => subscribe(scope, onStoreChange),
      [scope],
    ),
    React.useCallback(() => readExternalAgentPresentations(scope), [scope]),
    () => EMPTY_PRESENTATIONS,
  );
}

export function applyExternalAgentPresentationToProfile(
  pubkey: string,
  profile: Profile,
  presentations: ExternalAgentPresentations,
): Profile {
  const presentation = presentations[normalizePubkey(pubkey)];
  if (!presentation) return profile;
  return {
    ...profile,
    displayName: presentation.displayName ?? profile.displayName,
    avatarUrl: presentation.avatarUrl ?? profile.avatarUrl,
    about: presentation.about ?? profile.about,
  };
}

export function applyExternalAgentPresentationToSummary(
  pubkey: string,
  profile: UserProfileSummary,
  presentations: ExternalAgentPresentations,
): UserProfileSummary {
  const presentation = presentations[normalizePubkey(pubkey)];
  if (!presentation) return profile;
  return {
    ...profile,
    displayName: presentation.displayName ?? profile.displayName,
    avatarUrl: presentation.avatarUrl ?? profile.avatarUrl,
  };
}

export function applyExternalAgentPresentationsToUsersBatch(
  response: UsersBatchResponse,
  presentations: ExternalAgentPresentations,
): UsersBatchResponse {
  let changed = false;
  const profiles = Object.fromEntries(
    Object.entries(response.profiles).map(([pubkey, profile]) => {
      const presented = applyExternalAgentPresentationToSummary(
        pubkey,
        profile,
        presentations,
      );
      changed ||= presented !== profile;
      return [pubkey, presented];
    }),
  );
  return changed ? { ...response, profiles } : response;
}

export function formatExternalAgentRuntimeLabel(
  runtimeLabel: string | null | undefined,
): string | null {
  const normalized = runtimeLabel?.trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower.includes("hermes")) return "HERMES";
  if (lower === "agent" || lower === "external" || lower === "unknown") {
    return null;
  }
  return normalized.toUpperCase();
}
