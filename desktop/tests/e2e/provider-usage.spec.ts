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

test("Codex and Grok allowance stay visible and provider-scoped", async ({
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
  await expect(indicator).toContainText("Codex 48%");
  await expect(indicator).toContainText("Grok 74%");
  await indicator.click();
  await expect(page.getByText("Weekly · Resets")).toBeVisible();
  await expect(page.getByText("5-hour")).toBeVisible();
  await expect(page.getByTestId("provider-allowance-card-codex")).toContainText(
    "48% left",
  );
  await expect(page.getByTestId("provider-allowance-card-grok")).toContainText(
    "74% left",
  );
  await expect(page.getByTestId("provider-allowance-card-grok")).toContainText(
    "Experimental reader",
  );

  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-experimental").click();

  const experiments = page.getByTestId("settings-experimental");
  await expect(experiments.getByText("Provider coverage")).toBeVisible();
  await expect(experiments.getByText("Codex", { exact: true })).toBeVisible();
  await expect(experiments.getByText("Grok", { exact: true })).toBeVisible();
  await expect(page.getByTestId("settings-night-mode-edition")).toHaveAttribute(
    "href",
    "https://nytemode.dev",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("sidebar-provider-usage").first(),
  ).toContainText("Codex 48%");
});

test("an unsupported Grok reader is neutral and does not mask Codex", async ({
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
        status: "running",
      },
    ],
    providerUsageCapabilities: [
      {
        id: "codex",
        name: "Codex",
        availability: "available",
        detail: "Uses your existing local Codex sign-in",
      },
      {
        id: "claude",
        name: "Claude",
        availability: "unsupported",
        detail: "No supported standalone personal allowance reader yet",
      },
      {
        id: "grok",
        name: "Grok",
        availability: "unsupported",
        detail:
          "Grok Build consumer allowance is not exposed by this installation",
      },
    ],
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const indicator = page.getByTestId("sidebar-provider-usage").first();
  await expect(indicator).toContainText("Codex 48%");
  await expect(indicator).toContainText("Grok —");
  await expect(
    indicator
      .getByTestId("provider-usage-grok")
      .locator('[data-state="unavailable"]'),
  ).toBeVisible();
  await expect(
    indicator
      .getByTestId("provider-usage-grok")
      .locator('[data-state="error"]'),
  ).toHaveCount(0);

  await indicator.click();
  await expect(page.getByTestId("provider-usage-message-grok")).toContainText(
    "not exposed by this installation",
  );
  await expect(page.getByTestId("provider-usage-message-grok")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
});

test("a real Grok refresh failure remains isolated from Codex data", async ({
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
        status: "running",
      },
    ],
    providerUsageErrors: {
      grok: "grok_temporarily_unavailable",
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const indicator = page.getByTestId("sidebar-provider-usage").first();
  await expect(indicator).toContainText("Codex 48%");
  await expect(indicator).toContainText("Grok !");
  await indicator.click();
  await expect(page.getByTestId("provider-usage-message-grok")).toContainText(
    "Usage temporarily unavailable",
  );
  await expect(page.getByTestId("provider-usage-message-grok")).toHaveAttribute(
    "data-state",
    "error",
  );
});

test("a live Grok authentication response stays neutral", async ({ page }) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: "2".repeat(64),
        name: "Grok Agent",
        runtime: "grok",
        status: "running",
      },
    ],
    providerUsageErrors: {
      grok: "grok_not_authenticated",
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const indicator = page.getByTestId("sidebar-provider-usage").first();
  await expect(indicator).toContainText("Grok —");
  await expect(
    indicator
      .getByTestId("provider-usage-grok")
      .locator('[data-state="authRequired"]'),
  ).toBeVisible();
  await expect(
    indicator
      .getByTestId("provider-usage-grok")
      .locator('[data-state="error"]'),
  ).toHaveCount(0);
  await indicator.click();
  await expect(page.getByTestId("provider-usage-message-grok")).toContainText(
    "Sign in with Grok",
  );
  await expect(page.getByTestId("provider-usage-message-grok")).toHaveAttribute(
    "data-state",
    "authRequired",
  );
});
