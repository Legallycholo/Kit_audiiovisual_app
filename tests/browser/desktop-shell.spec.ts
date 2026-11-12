import { test, expect, storageKey } from "./harness";

test.use({ desktopTabs: true });
import AxeBuilder from "@axe-core/playwright";

test("unsaved proposal blocks tab close until cancelled, saved or discarded", async ({
  page,
}) => {
  await page.goto("/proposals/p2");
  const field = page.getByLabel("Título de la propuesta");
  await expect(field).toBeVisible();
  await field.fill("Draft protected by tabs");
  await page.getByRole("button", { name: "Cerrar pestaña activa" }).click();
  const dialog = page.getByRole("dialog", { name: "Cambios sin guardar" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(field).toHaveValue("Draft protected by tabs");
  await page.getByRole("button", { name: "Cerrar pestaña activa" }).click();
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/proposals/p2");
  await expect(field).toHaveValue("Draft protected by tabs");
});

test("unclean snapshot requires explicit recovery", async ({ page }) => {
  await page.goto("/events");
  await expect(
    page.getByRole("tablist", { name: "Pestañas abiertas" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = `kit.desktop.session.v1:company:user-admin-seed`;
    const state = JSON.parse(localStorage.getItem(key)!);
    state.clean = false;
    sessionStorage.setItem("crash-fixture", JSON.stringify(state));
  });
  await page.addInitScript(() => {
    const saved = sessionStorage.getItem("crash-fixture");
    if (saved) {
      localStorage.setItem(
        "kit.desktop.session.v1:company:user-admin-seed",
        saved,
      );
      sessionStorage.removeItem("crash-fixture");
    }
  });
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Restaurar sesión anterior" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restaurar pestañas", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Eventos", exact: true }),
  ).toBeVisible();
});

test("dark shell and library meet accessibility checks", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ theme: "dark" })),
    storageKey("kit.appearance"),
  );
  await page.goto("/library/files");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/desktop-dark.png", fullPage: true });
});

test("dark theme preserves readable existing workspaces", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ theme: "dark" })),
    storageKey("kit.appearance"),
  );
  for (const path of ["/", "/events", "/proposals/p2", "/design"]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      path,
    ).toEqual([]);
  }
});
test("primary destinations preserve navigation, tabs restore and history can be cleared", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  for (const label of [
    "Inicio",
    "Eventos",
    "Ventas",
    "Diseño",
    "Recursos",
    "KIT",
  ])
    await expect(
      nav.getByRole("link", { name: new RegExp(`^${label}`) }).first(),
    ).toBeVisible();
  await nav.getByRole("link", { name: /^Ventas/ }).click();
  await nav.getByRole("link", { name: "Propuestas", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "Pestañas abiertas" });
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await tabs.getByRole("tab", { name: "Inicio", exact: true }).click();
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await page.reload();
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Borrar todo el historial" })
    .click();
  await expect(
    dialog.getByText("No hay actividad en este filtro."),
  ).toBeVisible();
});
test("search opens a persistent tab and previews replace each other", async ({
  page,
}) => {
  await page.goto("/search?q=a");
  const results = page.locator("main .search-results button");
  await results.first().click();
  const tabs = page.getByRole("tablist", { name: "Pestañas abiertas" });
  await tabs.getByRole("tab", { name: "Búsqueda: a" }).click();
  await results.nth(1).click();
  await expect(tabs.getByRole("tab")).toHaveCount(2);
});
