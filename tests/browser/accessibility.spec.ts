import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const route of [
  "/",
  "/events",
  "/clients",
  "/venues",
  "/design",
  "/creative",
  "/proposals",
  "/proposals/p2",
  "/inbox",
  "/inventory",
  "/production",
  "/reports",
  "/settings",
]) {
  test(`automated accessibility checks: ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  });
}

test("proposal print preview contains only the client review document", async ({
  page,
}) => {
  await page.goto("/proposals/p2");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-proposal")).toBeVisible();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await page.screenshot({
    path: "artifacts/proposal-print.png",
    fullPage: true,
    animations: "disabled",
  });
});
