import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { Repository, HttpError } from "../../server/database";
import { createSeed } from "../../src/shared/seed";
import AxeBuilder from "@axe-core/playwright";
let repo: Repository;
let server: Server;
let root: string;
let failGeneration = false;
test.beforeEach(async ({ page }) => {
  failGeneration = false;
  repo = new Repository(":memory:");
  server = createApp(repo, {
    origins: ["http://127.0.0.1:5173"],
    proposalGenerator: {
      model: "test-model",
      generate: async () => {
        if (failGeneration)
          throw new HttpError(
            503,
            "Servicio de IA temporalmente no disponible.",
          );
        return {
          title: "Conferencia con audio profesional",
          introduction: "Propuesta preliminar para el encuentro del cliente.",
          items: [{ equipmentId: "q1", quantity: 2, days: 1 }],
          assumptions: ["Un día de uso."],
          questions: ["Confirmar los horarios de montaje."],
        };
      },
    },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // Proxy to an isolated real API/database. The model boundary alone is a test fixture.
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({
      url:
        root +
        new URL(route.request().url()).pathname +
        new URL(route.request().url()).search,
    });
    await route.fulfill({ response });
  });
});
test.afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  repo.close();
});
async function setup(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir espacio de empresa", exact: true })
    .click();
  await page
    .getByLabel("Tu nombre", { exact: true })
    .fill("Propietario de prueba");
  await page
    .getByLabel("Nombre de la empresa", { exact: true })
    .fill("Producciones de prueba");
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("owner@example.test");
  await page
    .getByLabel("Contraseña", { exact: false })
    .fill("test-only-password-123");
  await page
    .getByRole("button", { name: "Crear espacio de empresa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
}
test("company setup separates sample data and durable records survive sign-out", async ({
  page,
}) => {
  await setup(page);
  expect(repo.read().workspace.clients).toEqual([]);
  await page.goto("/clients");
  await page.getByRole("button", { name: "Agregar cliente", exact: true }).click();
  await page.getByLabel("Nombre de empresa o cliente").fill("Empresa nueva");
  await page.getByLabel("Contacto principal").fill("Persona de contacto");
  await page.getByRole("button", { name: "Guardar cliente", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(repo.read().workspace.clients[0].name).toBe("Empresa nueva");
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir espacio de empresa", exact: true })
    .click();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("owner@example.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("test-only-password-123");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión", exact: true }),
  ).toBeVisible();
  await page.goto("/clients");
  await expect(
    page.getByRole("button", { name: /^EN Empresa nueva/ }),
  ).toBeVisible();
});
test("owner reviews AI suggestion, edits, saves, reopens and preserves manual edits on regeneration", async ({
  page,
}) => {
  await setup(page);
  const seed = createSeed();
  seed.conversations.forEach((c) =>
    c.messages.forEach((m) => (m.at = new Date(m.at).toISOString())),
  );
  repo.save(seed, 0);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.goto("/proposals");
  await page
    .getByRole("button", { name: "Redactar con IA", exact: true })
    .click();
  await page
    .getByLabel("¿Qué debe incluir la propuesta?")
    .fill("Necesitamos dos altavoces para una conferencia de un día.");
  await page
    .getByRole("button", { name: "Generar sugerencia", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Sugerencia de propuesta" }),
  ).toBeVisible();
  const before = repo.read().workspace.proposals.length;
  await page
    .getByRole("button", {
      name: "Crear propuesta con esta sugerencia",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Título de la propuesta")).toHaveValue(
    "Conferencia con audio profesional",
  );
  expect(repo.read().workspace.proposals).toHaveLength(before + 1);
  await page
    .getByLabel("Introducción y alcance del evento")
    .fill("Alcance editado y revisado por el propietario.");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Propuesta guardada en el espacio de empresa.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Versión guardada", { exact: true }),
  ).toBeVisible();
  const draftUrl = page.url();
  await page.reload();
  await expect(
    page.getByLabel("Introducción y alcance del evento"),
  ).toHaveValue("Alcance editado y revisado por el propietario.");
  await page
    .getByRole("button", { name: "Mejorar con IA", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generar sugerencia", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Aplicar selección al borrador",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Reemplazar la lista de equipos y servicios").check();
  await page
    .getByRole("button", { name: "Aplicar selección al borrador", exact: true })
    .click();
  await expect(
    page.getByLabel("Introducción y alcance del evento"),
  ).toHaveValue("Alcance editado y revisado por el propietario.");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("button", { name: "Vista previa", exact: true }).click();
  await expect(page.locator(".print-proposal")).toContainText(
    "Alcance editado",
  );
  await expect(page.locator(".print-proposal")).not.toContainText(
    "Confirmar los horarios de montaje.",
  );
  await page
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  expect(page.url()).toBe(draftUrl);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/company-proposal-spanish.png",
    fullPage: true,
  });
});

test("provider failure preserves the brief and unsaved manual proposal edits", async ({
  page,
}) => {
  await setup(page);
  repo.save(createSeed(), 0);
  await page.goto("/proposals/p2");
  await page
    .getByLabel("Introducción y alcance del evento")
    .fill("Conservar este cambio manual sin guardar.");
  await page
    .getByRole("button", { name: "Mejorar con IA", exact: true })
    .click();
  await page
    .getByLabel("¿Qué debe incluir la propuesta?")
    .fill("Preparar una propuesta de iluminación para el evento.");
  failGeneration = true;
  await page
    .getByRole("button", { name: "Generar sugerencia", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "temporalmente no disponible",
  );
  await expect(page.getByLabel("¿Qué debe incluir la propuesta?")).toHaveValue(
    "Preparar una propuesta de iluminación para el evento.",
  );
  await page
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();
  await expect(
    page.getByLabel("Introducción y alcance del evento"),
  ).toHaveValue("Conservar este cambio manual sin guardar.");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Versión guardada", { exact: true }),
  ).toBeVisible();
  expect(
    repo.read().workspace.proposals.find((p) => p.id === "p2")?.introduction,
  ).toBe("Conservar este cambio manual sin guardar.");
});
