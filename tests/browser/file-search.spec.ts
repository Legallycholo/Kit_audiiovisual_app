import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed } from "../../src/shared/seed";
test("Rolando relationships, saved searches and automatic tabs", async ({
  page,
}) => {
  const data = createSeed();
  const event = data.events[0];
  data.clients.find((c) => c.id === event.clientId)!.contact = "Rolando Pérez";
  await page.addInitScript((data) => {
    if (!localStorage.getItem("kit.workspace.v1"))
      localStorage.setItem("kit.workspace.v1", JSON.stringify(data));
  }, data);
  await page.goto("/search?q=Rolando");
  await expect(
    page.getByRole("heading", { name: "Búsqueda: Rolando", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".search-results")
      .getByRole("button", { name: new RegExp(`^${event.name} Proyectos`) }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Relacionado con el cliente o proyecto", { exact: false })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Guardar búsqueda", exact: true })
    .click();
  await page.reload();
  await page.getByText("Búsquedas guardadas (1)").click();
  await expect(
    page.getByRole("link", { name: "Rolando", exact: true }),
  ).toBeVisible();
  await page
    .locator(".search-results")
    .getByRole("button", { name: new RegExp(`^${event.name} Proyectos`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/events/${event.id}`));
  await expect(
    page.getByRole("tab", { name: new RegExp(event.name) }).first(),
  ).toBeVisible();
});
test("browser file permissions fail closed and search remains accessible", async ({
  page,
}) => {
  await page.goto("/library/files");
  await expect(
    page.getByRole("heading", { name: "Archivos del equipo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Abre la ventana local de KIT Desktop", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Autorizar e indexar" }),
  ).toHaveCount(0);
  await page.goto("/search?q=not-a-real-match-746");
  await expect(
    page.getByText("No hay coincidencias.", { exact: false }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});
test("native permission UI requires consent, then supports pause and revocation (mock IPC)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const status = {
      home: "/fixture/home",
      policy: {
        granted: false,
        paused: false,
        cloudConsent: false,
        exclusions: [],
        ocr: false,
      },
      running: false,
      indexed: 0,
      scanned: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      exclusions: ["**/.ssh/**"],
      ocrAvailable: false,
      pendingDeletions: 0,
      lastScan: null,
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => 1,
        invoke: async (command: string, args: any) => {
          if (command === "file_status") return structuredClone(status);
          if (command === "file_policy") {
            if (
              args.policy.granted &&
              !status.policy.granted &&
              !args.confirmed
            )
              throw new Error("Consent required");
            status.policy = args.policy;
            return structuredClone(status);
          }
          if (command === "file_scan") return;
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten") return;
          throw new Error(`Unexpected fixture command: ${command}`);
        },
      },
    });
  });
  await page.goto("/#/library/files");
  const grant = page.getByRole("button", { name: "Autorizar e indexar" });
  await expect(grant).toBeDisabled();
  await page
    .getByLabel("Autorizo la lectura e indexación", { exact: false })
    .check();
  await grant.click();
  await expect(
    page.getByRole("button", { name: "Revocar acceso", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Revocar acceso", exact: true })
    .click();
  await expect(
    page.getByText("Sin autorización", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/file-permissions.png",
    fullPage: true,
  });
});
