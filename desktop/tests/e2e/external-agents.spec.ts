import { expect, test } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";

const ALICE_PUBKEY =
  "a0456f8689529792012deec933d7bbdfc8310ae766bd5d8e37df31bf4e14757d";

async function gotoAgents(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("open-agents-view")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId("open-agents-view").click();
  await waitForAnimations(page);
}

test("official agent grid contains the exact canonical ALICE card", async ({
  page,
}) => {
  await installMockBridge(page, {
    replaceRelayAgents: true,
    relayAgents: [
      {
        pubkey:
          "3a6275a3411195e9fc33a5107fd0e6bfc89aa38ef41599dc30f9d11b7cad46e8",
        name: "ZOEY",
        isOwnerManaged: true,
        ownerManagedPersonaId: "builtin:bumble",
        respondTo: "owner-only",
        status: "offline",
      },
    ],
  });
  await gotoAgents(page);

  const card = page.getByTestId(
    `canonical-external-agent-card-${ALICE_PUBKEY}`,
  );
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("ALICE");
  await expect(card).toContainText("HERMES");
  await expect(card.getByText("EXTERNAL", { exact: true })).toHaveCount(0);
  await expect(
    card.getByText("MANAGED ELSEWHERE", { exact: true }),
  ).toHaveCount(0);

  await expect(page.getByTestId("external-agents-section")).toHaveCount(0);
  await expect(
    page.getByText("Agents hosted outside this Buzz app.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId(
      "external-agent-card-3a6275a3411195e9fc33a5107fd0e6bfc89aa38ef41599dc30f9d11b7cad46e8",
    ),
  ).toHaveCount(0);

  const officialGrid = page
    .getByTestId("unified-agents-groups")
    .locator("> div")
    .first();
  await expect(officialGrid.getByTestId("new-agent-card")).toBeVisible();
  await expect(
    officialGrid.getByTestId(`canonical-external-agent-card-${ALICE_PUBKEY}`),
  ).toBeVisible();
});

test("archived canonical ALICE stays out of agent discovery", async ({
  page,
}) => {
  await installMockBridge(page, {
    archivedIdentities: [ALICE_PUBKEY],
    replaceRelayAgents: true,
  });
  await gotoAgents(page);

  await expect(
    page.getByTestId(`canonical-external-agent-card-${ALICE_PUBKEY}`),
  ).toHaveCount(0);
});

test("empty relay discovery never hides the official managed-agent library", async ({
  page,
}) => {
  const zoeyPubkey = "1".repeat(64);
  await installMockBridge(page, {
    replaceRelayAgents: true,
    personas: [
      {
        id: "builtin:bumble",
        displayName: "ZOEY",
        systemPrompt: "Canonical coding agent",
      },
    ],
    managedAgents: [
      {
        pubkey: zoeyPubkey,
        name: "ZOEY",
        personaId: "builtin:bumble",
        status: "running",
      },
    ],
  });
  await gotoAgents(page);

  await expect(
    page.getByTestId("persona-agent-row-builtin:bumble"),
  ).toBeVisible();
  await expect(page.getByTestId(`managed-agent-${zoeyPubkey}`)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop running agents" }),
  ).toBeVisible();
});
