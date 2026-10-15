import { test, expect } from "@playwright/test";

test("all main destinations load without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu próximo gran evento empieza aquí." }),
  ).toBeVisible();
  for (const [path, title] of [
    ["/events", "Eventos"],
    ["/clients", "Clientes"],
    ["/venues", "Lugares"],
    ["/design", "Estudio de diseño"],
    ["/creative", "Estudio creativo de IA"],
    ["/proposals", "Propuestas y cotizaciones"],
    ["/inbox", "Mensajes de clientes"],
    ["/inventory", "Equipos e inventario"],
    ["/production", "Equipo y producción"],
    ["/reports", "Informes"],
    ["/settings", "Configuración"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("create event and client edits survive a reload", async ({ page }) => {
  await page.goto("/events?new=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre del evento").fill("QA Leadership Summit");
  await dialog.getByLabel("Fecha de inicio").fill("2027-03-10");
  await dialog.getByLabel("Fecha de cierre").fill("2027-03-11");
  await dialog
    .getByLabel("Descripción del evento")
    .fill("Keynote audio, presentation screens, and reception lighting.");
  await dialog
    .getByRole("button", { name: "Crear evento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "QA Leadership Summit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "QA Leadership Summit", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Calendario",
    "Lugar y diseño",
    "Equipos",
    "Comercial",
    "Equipo y producción",
    "Recursos creativos",
    "Mensajes",
    "Documentos",
    "Actividad",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
  await page.goto("/clients");
  await page
    .getByRole("button", { name: "Agregar cliente", exact: true })
    .click();
  await page.getByLabel("Nombre de empresa o cliente").fill("QA Customer");
  await page.getByLabel("Contacto principal").fill("Test Contact");
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill("qa@example.com");
  await page
    .getByRole("button", { name: "Guardar cliente", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /QC QA Customer/ }),
  ).toBeVisible();
});

test("owner acceptance requires review and does not send an acknowledgment", async ({
  page,
}) => {
  await page.goto("/inbox?conversation=m1");
  await expect(
    page.getByText("Pendiente de revisión del propietario", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revisar aceptación", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("versión 2");
  await page
    .getByRole("button", { name: "Confirmar aceptación", exact: true })
    .click();
  await expect(
    page.getByText("Decisión del propietario registrada.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Decisión del propietario registrada.", { exact: false }),
  ).toBeVisible();
  await page.goto("/proposals/p1");
  await expect(page.getByText("Aceptada", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Título de la propuesta")).toBeDisabled();
  await page
    .getByRole("button", { name: "Nueva versión", exact: true })
    .click();
  await expect(page.getByText(/VERSIÓN 3/)).toBeVisible();
  await expect(page.getByLabel("Título de la propuesta")).toBeEnabled();
});

test("production readiness remains blocked until accepted scope and allocations are confirmed", async ({
  page,
}) => {
  await page.goto("/inbox?conversation=m1");
  await page
    .getByRole("button", { name: "Revisar aceptación", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar aceptación", exact: true })
    .click();
  await page.goto("/production?event=e1");
  await page
    .getByRole("tab", { name: "Preparación para producción", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar preparación", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Confirma 24 más × LED Wall Panel/),
  ).toBeVisible();

  await page.evaluate(() => {
    const key = "kit.workspace.v1";
    const workspace = JSON.parse(localStorage.getItem(key) || "{}");
    const event = workspace.events.find(
      (item: { id: string }) => item.id === "e1",
    );
    workspace.reservations = workspace.reservations.map(
      (reservation: { id: string; status: string }) =>
        reservation.id === "res2"
          ? { ...reservation, status: "Confirmed" }
          : reservation,
    );
    workspace.reservations.push({
      id: "res3",
      eventId: "e1",
      equipmentId: "q4",
      quantity: 12,
      start: event.date,
      end: event.endDate,
      status: "Confirmed",
    });
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload();
  await page
    .getByRole("tab", { name: "Preparación para producción", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar preparación", exact: true })
    .click();
  await expect(page.getByText("Preparación", { exact: true })).toBeVisible();
});

test("proposal line edits calculate and persist a revised total", async ({
  page,
}) => {
  await page.goto("/proposals/p2");
  await page.getByRole("button", { name: "02 Equipos y servicios" }).click();
  await page.getByLabel("Agregar equipo del catálogo").selectOption("q2");
  await page.getByLabel("Shure Wireless Microphone Cantidad").fill("2");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText("Propuesta guardada en este dispositivo.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "02 Equipos y servicios" }).click();
  await expect(
    page.getByLabel("Shure Wireless Microphone Cantidad"),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Revisar y enviar", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Preparar en mensajes",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog")).toContainText(
    "requiere una segunda confirmación del propietario",
  );
});

test("reservation conflicts are explained without overbooking", async ({
  page,
}) => {
  await page.goto("/inventory");
  await page
    .getByRole("button", { name: "Reservar equipos", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Cantidad", { exact: true })
    .fill("999");
  await page
    .getByRole("button", {
      name: "Verificar disponibilidad y reservar",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Only");
  await page
    .getByRole("dialog")
    .getByLabel("Cantidad", { exact: true })
    .fill("1");
  await page
    .getByRole("button", {
      name: "Verificar disponibilidad y reservar",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "Reservas", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Reserva provisional");
});

test("layout object editing, revision saving, undo and 3D rendering", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/design");
  await page.getByRole("button", { name: "Stand", exact: true }).click();
  await page.getByLabel("Etiqueta", { exact: true }).fill("Booth 101");
  await page.getByLabel("Ancho · m", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Guardar versión", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Seleccionar Booth 101", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Cargar plano de referencia").setInputFiles({
    name: "salon-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByLabel("Ancho conocido de la imagen · m").fill("30");
  await page
    .getByRole("button", { name: "Calibrar escala", exact: true })
    .click();
  await page
    .getByLabel("Fuente de las medidas")
    .fill("Plano del salón confirmado por el lugar.");
  await page
    .getByRole("button", {
      name: "Confirmar medidas verificadas",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Revisar equipos", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Moving Head Wash");
  await expect(page.getByRole("dialog")).toContainText("-12");
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar plano", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /layout-v\d+\.svg/,
  );
  await page
    .getByRole("button", { name: "Guardar versión", exact: true })
    .click();
  await page.reload();
  await expect(page.getByText("Medidas verificadas").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Seleccionar Booth 101", exact: true })
    .click();
  await page.getByLabel("Etiqueta", { exact: true }).fill("Booth recovered");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(
    page.getByText("Borrador recuperado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Seleccionar Booth recovered",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Descartar borrador", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Seleccionar Booth 101", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vista 3D", exact: true }).click();
  await expect(page.getByLabel("Diseño 3D interactivo del evento")).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/design-desktop.png",
    fullPage: true,
  });
});

test("a saved layout can seed a new event layout without copying verification", async ({
  page,
}) => {
  await page.goto("/design?event=e2");
  await expect(
    page.getByRole("heading", { name: "Comienza con un espacio" }),
  ).toBeVisible();
  await page
    .getByLabel("Plano para usar como plantilla")
    .selectOption("layout1");
  await page
    .getByRole("button", { name: "Copiar plantilla", exact: true })
    .click();
  await expect(page.getByLabel("Plano editable del evento")).toBeVisible();
  await expect(page.getByText("Sin verificar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Seleccionar Main stage", exact: true }),
  ).toBeVisible();
});

test("dashboard, tablet navigation, assistant and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Consultar a KIT", exact: true })
    .click();
  await expect(
    page.getByText("Asistente general pendiente", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar asistente", exact: true })
    .click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir navegación", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Eventos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Eventos", level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/events-tablet.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu próximo gran evento empieza aquí." }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
});
