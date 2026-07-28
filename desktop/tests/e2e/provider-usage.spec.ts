import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

test("provider allowance stays off until the user opts in", async ({
  page,
}) => {
  await installMockBridge(page, undefined, { seedPreviewFeatures: false });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("sidebar-provider-usage")).toHaveCount(0);

  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-experimental").click();

  const experiments = page.getByTestId("settings-experimental");
  const toggle = experiments.getByTestId("feature-toggle-providerUsage");
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId("sidebar-provider-usage")).toContainText(
    "Codex 48%",
  );
});

test("provider allowance picker and multi-window sidebar stay provider-scoped", async ({
  page,
}) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: "1".repeat(64),
        name: "Codex Agent",
        runtime: "codex",
        status: "running",
      },
      {
        pubkey: "2".repeat(64),
        name: "Grok Agent",
        runtime: "grok",
        model: "grok-4.5",
        status: "running",
      },
    ],
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const indicator = page.getByTestId("sidebar-provider-usage").first();
  await expect(indicator).toContainText("OAI 48%");
  await expect(indicator).toContainText("XAI —");
  await indicator.click();
  await expect(page.getByText("Weekly · Resets")).toBeVisible();
  await expect(page.getByText("5-hour")).toBeVisible();
  await expect(page.getByTestId("provider-allowance-card-codex")).toContainText(
    "48% left",
  );
  await expect(page.getByTestId("provider-allowance-card-grok")).toContainText(
    "Consumer allowance is available in Grok Settings",
  );

  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-experimental").click();

  const experiments = page.getByTestId("settings-experimental");
  await expect(experiments.getByText("Provider coverage")).toBeVisible();
  await expect(experiments.getByText("Codex", { exact: true })).toBeVisible();
  await expect(experiments.getByText("Grok", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("sidebar-provider-usage").first(),
  ).toContainText("Codex 48%");
});
