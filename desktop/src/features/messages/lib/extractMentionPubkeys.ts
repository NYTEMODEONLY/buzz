import { normalizePubkey } from "@/shared/lib/pubkey";
import { hasMention } from "./hasMention";

type MentionPubkeyCandidate = {
  displayName: string | null;
  isMember: boolean;
  pubkey?: string;
};

export function extractMentionPubkeysFromCandidates({
  candidates,
  explicitMentions,
  personaMentionNames,
  text,
}: {
  candidates: readonly MentionPubkeyCandidate[];
  explicitMentions: ReadonlyMap<string, string>;
  personaMentionNames: Iterable<string>;
  text: string;
}): string[] {
  const pubkeys = new Set<string>();
  const selectedDisplayNames = new Set(
    [...explicitMentions.keys(), ...personaMentionNames].map((name) =>
      name.trim().toLowerCase(),
    ),
  );

  for (const [displayName, pubkey] of explicitMentions) {
    if (hasMention(text, displayName)) {
      pubkeys.add(normalizePubkey(pubkey));
    }
  }

  const fallbackCandidatesByName = new Map<
    string,
    {
      displayName: string;
      memberPubkeys: Set<string>;
      pubkeys: Set<string>;
    }
  >();
  for (const candidate of candidates) {
    const displayName = candidate.displayName?.trim();
    if (!candidate.pubkey || !displayName) continue;

    const normalizedName = displayName.toLowerCase();
    if (selectedDisplayNames.has(normalizedName)) continue;

    const entry = fallbackCandidatesByName.get(normalizedName) ?? {
      displayName,
      memberPubkeys: new Set<string>(),
      pubkeys: new Set<string>(),
    };
    const normalizedPubkey = normalizePubkey(candidate.pubkey);
    entry.pubkeys.add(normalizedPubkey);
    if (candidate.isMember) {
      entry.memberPubkeys.add(normalizedPubkey);
    }
    fallbackCandidatesByName.set(normalizedName, entry);
  }

  for (const {
    displayName,
    memberPubkeys,
    pubkeys: candidatesForName,
  } of fallbackCandidatesByName.values()) {
    if (candidatesForName.size !== 1 || !hasMention(text, displayName)) {
      continue;
    }
    const [onlyPubkey] = candidatesForName;
    if (memberPubkeys.has(onlyPubkey)) {
      pubkeys.add(onlyPubkey);
    }
  }

  return [...pubkeys];
}
