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
  await expect(page.getByTestId("sidebar-provider-usage")).toHaveAttribute(
    "aria-label",
    /Codex: 48% left/,
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
  await expect(indicator).toHaveAttribute(
    "aria-label",
    /Codex: 48% left; Grok: 74% left/,
  );
  await expect(indicator.getByTestId("provider-usage-codex")).toContainText(
    /(Codex|C)\s*48%/,
  );
  await expect(indicator.getByTestId("provider-usage-grok")).toContainText(
    /(Grok|G)\s*74%/,
  );
  await indicator.click();
  await expect(page.getByText("Weekly · Resets")).toBeVisible();
  await expect(page.getByText("5-hour")).toBeVisible();
  await expect(page.getByTestId("provider-allowance-card-codex")).toContainText(
    "48% remaining",
  );
  await expect(page.getByTestId("provider-allowance-card-grok")).toContainText(
    "74% remaining",
  );
  await expect(page.getByTestId("provider-allowance-card-grok")).toContainText(
    "Experimental",
  );

  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-experimental").click();

  const experiments = page.getByTestId("settings-experimental");
  await expect(experiments.getByText("Provider coverage")).toBeVisible();
  await expect(experiments.getByText("Codex", { exact: true })).toBeVisible();
  await expect(experiments.getByText("Grok", { exact: true })).toBeVisible();
  await expect(page.getByTestId("settings-nytemode-edition")).toHaveAttribute(
    "href",
    "https://nytemode.dev",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("sidebar-provider-usage").first(),
  ).toHaveAttribute("aria-label", /Codex: 48% left/);
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
  await expect(indicator).toHaveAttribute(
    "aria-label",
    /Codex: 48% left; Grok: allowance unavailable/,
  );
  await expect(indicator.getByTestId("provider-usage-grok")).toContainText(
    /(Grok|G)\s*—/,
  );
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
  await expect(indicator).toHaveAttribute(
    "aria-label",
    /Codex: 48% left; Grok: usage refresh failed/,
  );
  await expect(indicator.getByTestId("provider-usage-grok")).toContainText(
    /(Grok|G)\s*!/,
  );
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
  await expect(indicator).toHaveAttribute(
    "aria-label",
    /Grok: sign-in required/,
  );
  await expect(indicator.getByTestId("provider-usage-grok")).toContainText(
    /(Grok|G)\s*—/,
  );
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

test("usage surfaces reflow, follow the active accent, and keep accessible structure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 500 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    window.localStorage.setItem("buzz-theme", "github-light");
    window.localStorage.setItem("buzz-accent-color", "#a855f7");
    window.localStorage.setItem("buzz-follow-system", "false");
    window.localStorage.setItem("buzz:text-scale", "1.5");
  });
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: "1".repeat(64),
        name: "Codex Agent",
        runtime: "codex",
        status: "running",
      },
      {
        pubkey: "3".repeat(64),
        name: "Claude Agent",
        runtime: "claude",
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
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).fontSize),
    )
    .toBe("24px");

  const topChrome = page.getByTestId("app-top-chrome");
  const chromeIndicator = topChrome.getByTestId("sidebar-provider-usage");
  await expect(chromeIndicator).toHaveAttribute(
    "aria-label",
    /Open AI usage details\. Codex: 48% left; Claude: allowance unavailable; Grok: 74% left/,
  );
  await expect(
    chromeIndicator.getByTestId("provider-usage-codex"),
  ).toContainText(/C\s*48%/);
  await expect(
    chromeIndicator.getByTestId("provider-usage-grok"),
  ).toContainText(/G\s*74%/);
  await expect(
    chromeIndicator.getByTestId("provider-usage-claude"),
  ).toContainText(/Cl\s*—/);

  const triggerBox = await chromeIndicator.boundingBox();
  expect(triggerBox).not.toBeNull();
  const providerBoxes = await chromeIndicator
    .locator('[data-testid^="provider-usage-"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right };
      }),
    );
  expect(providerBoxes).toHaveLength(3);
  const triggerLeft = triggerBox?.x ?? 0;
  const triggerRight = triggerLeft + (triggerBox?.width ?? 0);
  for (let index = 0; index < providerBoxes.length; index += 1) {
    const box = providerBoxes[index];
    expect(box?.left ?? 0).toBeGreaterThanOrEqual(triggerLeft);
    expect(box?.right ?? 0).toBeLessThanOrEqual(triggerRight);
    if (index > 0) {
      expect(providerBoxes[index - 1]?.right ?? 0).toBeLessThanOrEqual(
        box?.left ?? 0,
      );
    }
  }
  const navRightEdge = Math.max(
    ...(await topChrome
      .locator("[data-top-chrome-nav]")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().right),
      )),
  );
  expect(triggerLeft).toBeGreaterThanOrEqual(navRightEdge);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await chromeIndicator.focus();
  await page.keyboard.press("Enter");
  const usageDialog = page.getByRole("dialog", { name: "AI usage" });
  await expect(usageDialog).toBeVisible();
  await expect(usageDialog).toHaveAccessibleDescription(
    "3 providers used by active agents",
  );
  await expect(
    usageDialog.getByRole("region", { name: "Codex Pro" }),
  ).toBeVisible();
  await expect(usageDialog.getByRole("region", { name: "Grok" })).toBeVisible();
  await expect(
    usageDialog.getByRole("region", { name: "Claude" }),
  ).toBeVisible();
  await expect(
    usageDialog.getByRole("progressbar", { name: "Codex: 48% remaining" }),
  ).toHaveAttribute("aria-valuetext", /Weekly; resets/);

  const dialogBox = await usageDialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(
    500,
  );
  const grokProgressFill = await usageDialog
    .getByRole("progressbar", { name: "Grok: 74% remaining" })
    .locator(":scope > div")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(grokProgressFill).toBe("rgb(168, 85, 247)");
  await usageDialog
    .getByRole("button", { name: "Refresh Codex allowance" })
    .click();
  await expect(
    usageDialog.getByRole("status").filter({
      hasText: "Codex allowance updated.",
    }),
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(chromeIndicator).toBeFocused();
  await page.keyboard.press("Space");
  await expect(usageDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chromeIndicator).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId("open-settings").click();
  await page.getByTestId("profile-popover-settings").click();
  await page.getByTestId("settings-nav-appearance").click();
  const settingsSidebar = page.getByTestId("settings-sidebar");
  const settingsIndicator = settingsSidebar.getByTestId(
    "sidebar-provider-usage",
  );
  const versionFooter = page.getByTestId("settings-version");
  await expect(settingsIndicator).toContainText("AI usage");
  const [settingsBox, footerBox] = await Promise.all([
    settingsIndicator.boundingBox(),
    versionFooter.boundingBox(),
  ]);
  expect(settingsBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(
    (settingsBox?.y ?? 0) + (settingsBox?.height ?? 0),
  ).toBeLessThanOrEqual(footerBox?.y ?? 0);

  const healthyRingStroke = await settingsIndicator
    .getByTestId("provider-usage-grok")
    .locator("circle")
    .nth(1)
    .evaluate((element) => getComputedStyle(element).stroke);
  expect(healthyRingStroke).toBe("rgb(168, 85, 247)");
  const warningRingStroke = await settingsIndicator
    .getByTestId("provider-usage-codex")
    .locator("circle")
    .nth(1)
    .evaluate((element) => getComputedStyle(element).stroke);
  const warningColor = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ui-warning)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(warningRingStroke).toBe(warningColor);

  await page.getByTestId("appearance-mode-dark").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      settingsIndicator
        .getByTestId("provider-usage-grok")
        .locator("circle")
        .nth(1)
        .evaluate((element) => getComputedStyle(element).stroke),
    )
    .toBe("rgb(168, 85, 247)");

  await page.setViewportSize({ width: 800, height: 500 });
  await settingsIndicator.click();
  const settingsUsageDialog = page.getByRole("dialog", { name: "AI usage" });
  await expect(settingsUsageDialog).toBeVisible();
  const [settingsDialogBox, sidebarBox] = await Promise.all([
    settingsUsageDialog.boundingBox(),
    settingsSidebar.boundingBox(),
  ]);
  expect(settingsDialogBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(settingsDialogBox?.x ?? 0).toBeGreaterThanOrEqual(
    (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0),
  );
  expect(
    (settingsDialogBox?.x ?? 0) + (settingsDialogBox?.width ?? 0),
  ).toBeLessThanOrEqual(800);
  expect(
    (settingsDialogBox?.y ?? 0) + (settingsDialogBox?.height ?? 0),
  ).toBeLessThanOrEqual(500);
});
