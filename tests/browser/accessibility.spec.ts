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
  await page.getByRole("button", { name: "Vista previa", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-proposal")).toBeVisible();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await page.screenshot({
    path: "artifacts/proposal-print.png",
    fullPage: true,
    animations: "disabled",
  });
});

// Stage 2 (additive): every destination in both themes and both densities,
// keyboard-only passes over the new navigation, and token contrast checks.
test.describe("stage 2 accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kit.mode", "sample"));
  });
  const appearance = (theme: string, density: string) =>
    JSON.stringify({ theme, density });
  for (const route of [
    "/",
    "/reports",
    "/events",
    "/events/e1",
    "/production",
    "/proposals",
    "/proposals/p2",
    "/inbox",
    "/clients",
    "/design",
    "/creative",
    "/inventory",
    "/venues",
    "/library/files",
    "/kit",
    "/search?q=a",
    "/settings/general",
    "/settings/users",
    "/settings/integrations",
    "/settings/appearance",
    "/settings/data",
  ]) {
    test(`axe in both themes and densities: ${route}`, async ({ page }) => {
      for (const theme of ["light", "dark"])
        for (const density of ["comfortable", "compact"]) {
          await page.addInitScript(
            (value) =>
              localStorage.setItem("kit.appearance:sample:sample", value),
            appearance(theme, density),
          );
          await page.goto(route);
          await expect(page.locator("main h1").first()).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute(
            "data-density",
            density,
          );
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            results.violations
              .filter((v) => ["serious", "critical"].includes(v.impact || ""))
              .map((v) => ({
                id: v.id,
                theme,
                density,
                nodes: v.nodes.map((n) => n.target),
              })),
          ).toEqual([]);
        }
    });
  }

  test("sidebar, palette and menus work with the keyboard only", async ({
    page,
  }) => {
    await page.goto("/events");
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    // Skip link first, then the brand, then navigation rows.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Ir al contenido" }),
    ).toBeFocused();
    await nav.getByRole("link", { name: "Ventas" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/proposals$/);
    const chevron = nav.getByRole("button", { name: "Ocultar Ventas" });
    await chevron.focus();
    await page.keyboard.press("Enter");
    await expect(nav.getByRole("link", { name: "Mensajes" })).toBeHidden();
    await page.keyboard.press("Enter");
    await nav.getByRole("link", { name: "Mensajes" }).focus();
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    );
    expect(outline).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/inbox$/);

    // Command palette.
    await page.keyboard.press("Control+k");
    const combobox = page.getByRole("combobox", {
      name: "Buscar acciones, páginas y registros",
    });
    await expect(combobox).toBeFocused();
    await page.keyboard.type("lugares");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/venues$/);
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Escape");
    await expect(combobox).toBeHidden();

    // Header "⋯" menu.
    await page.goto("/clients");
    const more = page.getByRole("button", { name: "Más acciones" });
    await more.focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Exportar CSV" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Importar CSV" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await expect(page.getByRole("menu")).toBeHidden();

    // Account menu.
    await page.locator(".user-chip").focus();
    await page.keyboard.press("Enter");
    const account = page.getByRole("dialog", { name: "Cuenta" });
    await expect(account).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(account).toBeHidden();
    await expect(page.locator(".user-chip")).toBeFocused();
  });

  test("the phone drawer traps focus and closes with Escape", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const open = page.getByRole("button", { name: "Abrir navegación" });
    await open.click();
    const drawer = page.getByRole("dialog", { name: "Menú de navegación" });
    await expect(drawer).toBeVisible();
    for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector(".sidebar")!.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(open).toBeFocused();
    const targets = await page
      .locator(".topbar button")
      .evaluateAll((buttons) =>
        buttons.map((b) => {
          const box = b.getBoundingClientRect();
          return Math.min(box.width, box.height);
        }),
      );
    expect(Math.min(...targets)).toBeGreaterThanOrEqual(44);
  });

  test("token contrast matches the palette ratios", async ({ page }) => {
    for (const theme of ["light", "dark"])
      for (const accent of ["blue", "red", "green"]) {
        await page.addInitScript(
          (value) =>
            localStorage.setItem("kit.appearance:sample:sample", value),
          JSON.stringify({ theme, accent }),
        );
        await page.goto("/settings/appearance");
        const ratios = await page.evaluate(() => {
          const probe = document.createElement("span");
          document.body.append(probe);
          const rgb = (token: string) => {
            probe.style.color = `var(${token})`;
            return getComputedStyle(probe)
              .color.match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number);
          };
          const lum = ([r, g, b]: number[]) => {
            const c = [r, g, b].map((v) => {
              v /= 255;
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
          };
          const ratio = (a: string, b: string) => {
            const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
            return (x + 0.05) / (y + 0.05);
          };
          const result = {
            text: ratio("--color-text", "--color-bg"),
            muted: ratio("--color-text-muted", "--color-surface"),
            primary: ratio("--color-primary", "--color-surface"),
            onPrimary: ratio("--color-on-primary", "--color-primary"),
            danger: ratio("--color-danger", "--color-surface"),
            success: ratio("--color-success", "--color-surface"),
            warning: ratio("--color-warning", "--color-surface"),
            inputBorder: ratio("--color-border-strong", "--color-surface"),
            focus: ratio("--color-focus", "--color-surface"),
          };
          probe.remove();
          return result;
        });
        for (const [name, value] of Object.entries(ratios))
          expect(value, `${theme}/${accent} ${name}`).toBeGreaterThanOrEqual(
            ["inputBorder", "focus"].includes(name) ? 3 : 4.5,
          );
      }
  });
});
