import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("unsaved proposal blocks tab close until cancelled, saved or discarded", async ({
  page,
}) => {
  await page.goto("/proposals/p2");
  const field = page.getByLabel("Título de la propuesta");
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
  await page.evaluate(() => {
    const key = "kit.desktop.session.v1:sample:sample";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.clean = false;
    sessionStorage.setItem("crash-fixture", JSON.stringify(state));
  });
  await page.addInitScript(() => {
    const saved = sessionStorage.getItem("crash-fixture");
    if (saved) {
      localStorage.setItem("kit.desktop.session.v1:sample:sample", saved);
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
  await page.goto("/library");
  await page.getByLabel("Apariencia").selectOption("dark");
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
  await page.addInitScript(() => localStorage.setItem("kit.theme", "dark"));
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
test("five hubs preserve navigation, tabs restore and history can be cleared", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await nav.getByRole("link", { name: "Proyectos", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Secciones del área" })
    .getByRole("link", { name: "Propuestas", exact: true })
    .click();
  const tabs = page.getByRole("tablist", { name: "Pestañas abiertas" });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await tabs.getByRole("tab", { name: "Eventos", exact: true }).click();
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await page.reload();
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await page.getByLabel("Apariencia").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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
