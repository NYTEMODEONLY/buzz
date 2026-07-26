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
    "48% left",
  );
});

test("provider allowance picker and multi-window sidebar stay provider-scoped", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const indicator = page.getByTestId("sidebar-provider-usage").first();
  await expect(indicator).toContainText("48% left");
  await indicator.click();
  await expect(page.getByText("Weekly · Resets")).toBeVisible();
  await expect(page.getByText("5-hour")).toBeVisible();

  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-experimental").click();

  const experiments = page.getByTestId("settings-experimental");
  await expect(experiments.getByText("Allowance provider")).toBeVisible();
  await expect(
    experiments.getByRole("button", { name: /Auto/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    experiments.getByRole("button", { name: /Claude/ }),
  ).toBeDisabled();
  await expect(
    experiments.getByRole("button", { name: /Grok/ }),
  ).toBeDisabled();

  await experiments.getByRole("button", { name: /Codex/ }).click();
  await expect(
    experiments.getByRole("button", { name: /Codex/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("sidebar-provider-usage").first(),
  ).toContainText("48% left");
  await expect(
    page
      .getByTestId("settings-experimental")
      .getByRole("button", { name: /Codex/ }),
  ).toHaveAttribute("aria-pressed", "true");
});
