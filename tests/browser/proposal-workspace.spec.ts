import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./harness";

const newProposal = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Nueva propuesta", exact: true }).click();

test("a new proposal opens a KIT Classic document at once, without choosing an event", async ({
  page,
  company,
}) => {
  const before = (await company.repo.read()).workspace.proposals.length;
  await page.goto("/proposals");
  await newProposal(page);
  await expect(page).toHaveURL(/\/proposals\/[^/?]+$/);
  const sheet = page.locator(".template-classic");
  await expect(sheet).toBeVisible();
  // Brand, slogan and company details come from settings.
  await expect(sheet).toContainText("KIT Audiovisual");
  await expect(sheet).toContainText("La gente de los eventos");
  await expect(sheet).toContainText("787-436-8556");
  await expect(sheet).toContainText("PROPUESTA");
  await expect(sheet).toContainText(
    new RegExp(`KIT-${new Date().getFullYear()}-\\d{3}`),
  );
  const stored = (await company.repo.read()).workspace.proposals;
  expect(stored).toHaveLength(before + 1);
  const created = stored.at(-1)!;
  expect(created).toMatchObject({
    eventId: "",
    status: "Draft",
    presentationTemplate: "Classic",
  });
  // Typing straight into the document works and saves.
  await page
    .getByLabel("Título de la propuesta")
    .fill("Proyección para 200 personas");
  await page.getByLabel("Cliente", { exact: true }).fill("Humberto Ramírez");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Versión guardada", { exact: true }),
  ).toBeVisible();
  const saved = (await company.repo.read()).workspace.proposals.at(-1)!;
  expect(saved.title).toBe("Proyección para 200 personas");
  expect(saved.clientSnapshot?.name).toBe("Humberto Ramírez");
  expect(saved.updatedAt).toBeTruthy();
});

test("starting from an event pre-fills the document and keeps the master client untouched", async ({
  page,
  company,
}) => {
  await page.goto("/proposals?event=e1");
  await newProposal(page);
  const sheet = page.locator(".template-classic");
  const workspace = (await company.repo.read()).workspace;
  const event = workspace.events.find((e) => e.id === "e1")!;
  const client = workspace.clients.find((c) => c.id === event.clientId)!;
  await expect(page.getByLabel("Título de la propuesta")).toHaveValue(
    event.name,
  );
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    client.name,
  );
  await expect(sheet).toContainText(`${event.attendees} asistentes`);
  // Editing the displayed client name does not rewrite the client record.
  await page
    .getByLabel("Cliente", { exact: true })
    .fill("Nombre solo en este documento");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Versión guardada", { exact: true }),
  ).toBeVisible();
  const after = (await company.repo.read()).workspace;
  expect(after.clients.find((c) => c.id === client.id)!.name).toBe(client.name);
  expect(after.proposals.at(-1)!.clientSnapshot?.name).toBe(
    "Nombre solo en este documento",
  );
});

test("lines, discount and totals follow quoteTotals, and an event can be linked later", async ({
  page,
  company,
}) => {
  await page.goto("/proposals");
  await newProposal(page);
  await page.getByLabel("Agregar equipo del catálogo").selectOption("q2");
  await page.getByRole("button", { name: "Servicio personalizado" }).click();
  await page
    .getByLabel("Descripción de la partida 2")
    .fill("Técnicos de montaje");
  await page.getByLabel("Técnicos de montaje Cantidad").fill("2");
  await page.getByLabel("Técnicos de montaje Tarifa").fill("100");
  const catalog = (await company.repo.read()).workspace.equipment.find(
    (q) => q.id === "q2",
  )!;
  const subtotal = catalog.rate + 200;
  await expect(page.locator(".doc-totals")).toContainText(
    new Intl.NumberFormat("es-PR", {
      style: "currency",
      currency: "USD",
    }).format(subtotal),
  );
  await page.getByLabel("Descuento %").fill("10");
  const total = subtotal - Math.round(subtotal * 10) / 100;
  await expect(page.locator(".doc-grand-total")).toContainText(
    new Intl.NumberFormat("es-PR", {
      style: "currency",
      currency: "USD",
    }).format(total),
  );
  // Remove the catalog row; reorder is available for the rest.
  await page.getByRole("button", { name: `Quitar ${catalog.name}` }).click();
  await expect(page.locator(".doc-table tbody tr")).toHaveCount(1);
  // Link an event afterwards: the server accepts the first link.
  await page.getByLabel("Evento vinculado").selectOption("e1");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Versión guardada", { exact: true }),
  ).toBeVisible();
  const saved = (await company.repo.read()).workspace.proposals.at(-1)!;
  expect(saved.eventId).toBe("e1");
  expect(saved.lines.map((l) => l.description)).toEqual([
    "Técnicos de montaje",
  ]);
  expect(saved.discount).toBe(10);
  // Once linked, the event cannot be changed from the editor.
  await expect(page.getByLabel("Evento vinculado")).toBeDisabled();
});

test("preview shows only the client document, the shortcut toggles it, and print keeps the sheet alone", async ({
  page,
}) => {
  await page.goto("/proposals/p2");
  await expect(page.getByLabel("KIT para esta propuesta")).toBeVisible();
  await page.keyboard.press("Control+Shift+P");
  await expect(
    page.getByRole("button", { name: "Editar", exact: true }),
  ).toBeVisible();
  const sheet = page.locator(".proposal-sheet");
  await expect(sheet.locator("input, textarea, select")).toHaveCount(0);
  await expect(page.getByLabel("KIT para esta propuesta")).toHaveCount(0);
  await expect(page.locator(".proposal-options")).toHaveCount(0);
  await expect(page.locator(".doc-row-tools")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(page.locator(".topbar")).not.toBeVisible();
  await expect(page.locator(".proposal-editor-top")).not.toBeVisible();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".doc-grand-total")).toBeVisible();
  const print = await page.evaluate(() => {
    const box = document
      .querySelector(".proposal-sheet")!
      .getBoundingClientRect();
    return { left: box.left, top: box.top };
  });
  expect(print.left).toBeLessThan(2);
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Control+Shift+P");
  await expect(
    page.getByRole("button", { name: "Vista previa", exact: true }),
  ).toBeVisible();
});

test("existing proposals keep their data and an accepted revision stays untouched by a new one", async ({
  page,
  company,
}) => {
  const before = (await company.repo.read()).workspace;
  const p1 = before.proposals.find((p) => p.id === "p1")!;
  await page.goto(`/proposals/${p1.id}`);
  // Saved with an earlier template: preview keeps that presentation.
  await page.getByRole("button", { name: "Vista previa", exact: true }).click();
  await expect(page.locator(".print-proposal")).toContainText(p1.title);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Versiones", exact: true }).click();
  const list = page.locator(".proposal-version-list");
  await expect(list).toContainText(`v${p1.version}`);
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
  await page
    .getByRole("button", { name: "Nueva versión", exact: true })
    .click();
  await expect(
    page
      .locator(".proposal-editor-meta")
      .getByText(`· v${p1.version + 1}`, { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Título de la propuesta")
    .fill("Cambio en la nueva versión");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Versión guardada", { exact: true }),
  ).toBeVisible();
  const after = (await company.repo.read()).workspace;
  const unchanged = after.proposals.find((p) => p.id === p1.id)!;
  expect(unchanged.title).toBe(p1.title);
  expect(unchanged.lines).toEqual(p1.lines);
  expect(unchanged.version).toBe(p1.version);
});

test("company details edited in Configuración appear in the document header", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await page.getByLabel("Eslogan").fill("Eventos hechos con gente");
  await page.getByLabel("Teléfono").fill("787-000-1111");
  await page.getByRole("button", { name: "Guardar perfil de empresa" }).click();
  await expect(
    page.getByText("Preferencias de la empresa guardadas.", { exact: false }),
  ).toBeVisible();
  await page.goto("/proposals/p2");
  const sheet = page.locator(".template-classic");
  await expect(sheet).toContainText("Eventos hechos con gente");
  await expect(sheet).toContainText("787-000-1111");
});

test("the editor works on a tablet and phone: KIT opens as a drawer and nothing overflows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1100 });
  await page.goto("/proposals/p2");
  await expect(page.locator(".proposal-sheet")).toBeVisible();
  // Narrow screens keep the document first; KIT opens on demand as a dialog.
  await expect(page.getByLabel("KIT para esta propuesta")).toHaveCount(0);
  await page.getByRole("button", { name: "KIT", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "KIT" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByLabel("¿Qué debe incluir la propuesta?"),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".proposal-sheet")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "artifacts/proposal-mobile.png",
    fullPage: true,
  });
});
