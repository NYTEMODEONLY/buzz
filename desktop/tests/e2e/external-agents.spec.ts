import { expect, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

async function gotoAgents(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("open-agents-view")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId("open-agents-view").click();
  await waitForAnimations(page);
}

test("owned Hermes agent has an editable persistent ALICE card", async ({
  page,
}) => {
  const alicePubkey = TEST_IDENTITIES.alice.pubkey;
  const uploadedAvatarUrl = "https://mock.relay/media/alice-avatar.png";
  const uploadedAvatarBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route(uploadedAvatarUrl, (route) =>
    route.fulfill({
      body: uploadedAvatarBytes,
      contentType: "image/png",
      status: 200,
    }),
  );
  await installMockBridge(page, {
    replaceRelayAgents: true,
    relayAgents: [
      {
        pubkey: alicePubkey,
        name: "Alice",
        agentType: "hermes-acp",
        channelNames: ["general", "agents"],
        respondTo: "anyone",
        status: "online",
      },
    ],
    searchProfiles: [
      {
        pubkey: alicePubkey,
        displayName: "Alice",
        about: "Host-owned Hermes profile",
        ownerPubkey: "deadbeef".repeat(8),
        isAgent: true,
      },
    ],
    uploadDescriptors: [
      {
        filename: "alice-avatar.png",
        sha256: "a".repeat(64),
        size: 128,
        type: "image/png",
        uploaded: 1_779_900_000,
        url: uploadedAvatarUrl,
      },
    ],
  });
  await gotoAgents(page);

  const card = page.getByTestId(`external-agent-card-${alicePubkey}`);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Alice");
  await expect(card.getByText("EXTERNAL", { exact: true })).toBeVisible();
  await expect(card.getByText("HERMES", { exact: true })).toBeVisible();
  await expect(card).toContainText("Online");
  await expect(page.getByTestId(`managed-agent-${alicePubkey}`)).toHaveCount(0);

  await page.getByTestId(`edit-external-agent-${alicePubkey}`).click();
  const dialog = page.getByTestId("external-agent-presentation-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Hermes keeps control");
  await dialog.getByTestId("external-agent-display-name").fill("ALICE");
  await dialog
    .getByTestId("external-agent-about")
    .fill("Hermes research and operations agent.");
  await dialog.getByTestId("external-agent-runtime-label").fill("HERMES");
  const avatarInput = dialog.getByTestId("external-agent-avatar-input");
  await expect(avatarInput).toBeEnabled();
  await avatarInput.setInputFiles({
    buffer: uploadedAvatarBytes,
    mimeType: "image/png",
    name: "alice-avatar.png",
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __BUZZ_E2E_COMMAND_LOG__?: Array<{ command: string }>;
            }
          ).__BUZZ_E2E_COMMAND_LOG__?.filter(
            (entry) => entry.command === "upload_media_bytes",
          ).length ?? 0,
      ),
    )
    .toBe(1);
  await expect(
    dialog
      .getByTestId("external-agent-avatar-preview")
      .locator(`img[src="${uploadedAvatarUrl}"]`),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("ALICE");
  await expect(card.getByText("EXTERNAL", { exact: true })).toBeVisible();
  await expect(card.getByText("HERMES", { exact: true })).toBeVisible();
  await expect(card.locator(`img[src="${uploadedAvatarUrl}"]`)).toBeVisible();

  await page.getByTestId(`edit-external-agent-${alicePubkey}`).click();
  await expect(page.getByTestId("external-agent-display-name")).toHaveValue(
    "ALICE",
  );
  await expect(page.getByTestId("external-agent-about")).toHaveValue(
    "Hermes research and operations agent.",
  );
  await expect(page.getByTestId("external-agent-runtime-label")).toHaveValue(
    "HERMES",
  );
  await page.keyboard.press("Escape");

  await card
    .getByRole("button", { name: "ALICE external agent profile" })
    .click();
  const panel = page.getByTestId("user-profile-panel");
  await expect(panel).toContainText("ALICE");
  await expect(panel.getByTestId("user-profile-description")).toHaveText(
    "Hermes research and operations agent.",
  );
  await expect(panel.locator(`img[src="${uploadedAvatarUrl}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();

  await expect(
    page
      .getByTestId("channel-alice-tyler")
      .locator(`img[src="${uploadedAvatarUrl}"]`),
  ).toBeVisible();

  await page.reload();
  await page.getByTestId("open-agents-view").click();
  const reloadedCard = page.getByTestId(`external-agent-card-${alicePubkey}`);
  await expect(reloadedCard).toContainText("ALICE");
  await expect(
    reloadedCard.getByText("EXTERNAL", { exact: true }),
  ).toBeVisible();
  await expect(reloadedCard.getByText("HERMES", { exact: true })).toBeVisible();
  await expect(
    page.getByTestId(`edit-external-agent-${alicePubkey}`),
  ).toBeVisible();

  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  await page.getByTestId("message-input").fill("@ali");
  const autocomplete = page
    .getByTestId("message-composer")
    .getByTestId("mention-autocomplete");
  await expect(autocomplete.getByText("ALICE", { exact: true })).toBeVisible();
  await expect(autocomplete.getByText("Alice", { exact: true })).toHaveCount(0);
});

test("joined-DM agent stays visible when the relay directory misses it", async ({
  page,
}) => {
  const alicePubkey = TEST_IDENTITIES.alice.pubkey;
  await installMockBridge(page, {
    replaceRelayAgents: true,
    searchProfiles: [
      {
        pubkey: alicePubkey,
        displayName: "Alice",
        ownerPubkey: "deadbeef".repeat(8),
        isAgent: true,
      },
    ],
  });
  await gotoAgents(page);

  const card = page.getByTestId(`external-agent-card-${alicePubkey}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("Alice");
  await expect(
    page.getByTestId(`edit-external-agent-${alicePubkey}`),
  ).toBeVisible();
});

test("external cards without verified ownership are view-only", async ({
  page,
}) => {
  const alicePubkey = TEST_IDENTITIES.alice.pubkey;
  await installMockBridge(page, {
    replaceRelayAgents: true,
    searchProfiles: [
      {
        pubkey: alicePubkey,
        displayName: "Alice",
        ownerPubkey: TEST_IDENTITIES.outsider.pubkey,
        isAgent: true,
      },
    ],
  });
  await gotoAgents(page);

  await expect(
    page.getByTestId(`external-agent-card-${alicePubkey}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`edit-external-agent-${alicePubkey}`),
  ).toHaveCount(0);
});

test("owner-only canonical identity suppresses a running same-persona sibling", async ({
  page,
}) => {
  const canonicalPubkey = "1".repeat(64);
  const siblingPubkey = "2".repeat(64);
  const personaId = "persona:zero";
  await installMockBridge(page, {
    replaceRelayAgents: true,
    personas: [
      {
        id: personaId,
        displayName: "ZERO",
        systemPrompt: "Canonical coding agent",
      },
    ],
    managedAgents: [
      {
        pubkey: siblingPubkey,
        name: "ZERO",
        personaId,
        status: "running",
      },
    ],
    relayAgents: [
      {
        pubkey: canonicalPubkey,
        name: "ZERO",
        isOwnerManaged: true,
        ownerManagedPersonaId: personaId,
        respondTo: "owner-only",
        status: "offline",
      },
    ],
  });
  await gotoAgents(page);

  const canonicalCard = page.getByTestId(
    `external-agent-card-${canonicalPubkey}`,
  );
  await expect(canonicalCard).toBeVisible();
  await expect(canonicalCard).toContainText("MANAGED ELSEWHERE");
  await expect(page.getByTestId(`managed-agent-${siblingPubkey}`)).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId(`persona-runtime-start-${personaId}`),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop running agents" }),
  ).toHaveCount(0);
});

test("archived external identity stays out of agent discovery", async ({
  page,
}) => {
  const archivedPubkey = "4".repeat(64);
  await installMockBridge(page, {
    archivedIdentities: [archivedPubkey],
    replaceRelayAgents: true,
    relayAgents: [
      {
        pubkey: archivedPubkey,
        name: "Retired agent",
        agentType: "hermes-acp",
        channelNames: ["general"],
        respondTo: "anyone",
        status: "offline",
      },
    ],
    searchProfiles: [
      {
        pubkey: archivedPubkey,
        displayName: "Retired agent",
        isAgent: true,
      },
    ],
  });
  await gotoAgents(page);

  await expect(
    page.getByTestId(`external-agent-card-${archivedPubkey}`),
  ).toHaveCount(0);
});
