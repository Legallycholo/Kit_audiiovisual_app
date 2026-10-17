import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

test("creative references, review, revisions and proposal selection persist", async ({
  page,
}) => {
  await page.goto("/creative");
  await page
    .getByRole("tab", { name: "Recursos de marca", exact: true })
    .click();
  await page.getByLabel("Evento vinculado").selectOption("e2");
  await page
    .getByText(
      "Confirmo que la empresa tiene derecho a usar esta referencia.",
      { exact: true },
    )
    .click();
  await page.getByLabel("Cargar referencia de marca").setInputFiles({
    name: "northstar-brand.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByText("northstar-brand.png", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("tab", { name: "Conceptos y medios", exact: true })
    .click();
  await page.getByLabel("Evento vinculado").selectOption("e2");
  await page.getByLabel("northstar-brand.png").check();
  await page.getByLabel("Dirección creativa").fill("Muy breve");
  await page
    .getByRole("button", { name: "Generar concepto local", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("preserved");
  await expect(page.getByLabel("Dirección creativa")).toHaveValue("Muy breve");
  const brief =
    "Un escenario ejecutivo cálido con pantallas limpias, luz ámbar y presencia clara de la marca.";
  await page.getByLabel("Dirección creativa").fill(brief);
  await page
    .getByRole("button", { name: "Generar concepto local", exact: true })
    .click();
  await expect(
    page.getByText("CONCEPTO GENERADO · DEMOSTRACIÓN LOCAL", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 referencia(s) · 1 unidad", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crear revisión", exact: true })
    .click();
  await page
    .getByLabel("Dirección creativa")
    .fill(`${brief} Añadir un tratamiento central para el logotipo.`);
  await page
    .getByRole("button", { name: "Generar concepto local", exact: true })
    .click();
  await expect(page.getByText(/Revisión 2 · Local showcase/)).toBeVisible();
  await page
    .getByRole("button", { name: "Aprobar concepto", exact: true })
    .click();
  await page.getByLabel("Adjuntar a propuesta borrador").selectOption("p2");
  await expect(
    page.getByText("Concepto adjuntado a la propuesta borrador.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Evento vinculado").selectOption("e2");
  await expect(
    page.getByRole("button", { name: /Seleccionar .* revisión 2/ }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Seleccionados para propuestas", exact: true })
    .click();
  await expect(
    page.getByText("KIT-2026-002 · v1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Rev. 2", { exact: true })).toBeVisible();
});

test("visual proposal revision combines reviewed media and client-safe print output", async ({
  page,
}) => {
  await page.goto("/creative");
  await page
    .getByLabel("Dirección creativa")
    .fill(
      "Una dirección costera elegante con luz cálida, escenario limpio y una experiencia ejecutiva premium.",
    );
  await page
    .getByRole("button", { name: "Generar concepto local", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aprobar concepto", exact: true })
    .click();

  await page.goto("/proposals/p1");
  await page
    .getByRole("button", { name: "Nueva versión", exact: true })
    .click();
  await expect(page.getByText(/VERSIÓN 3/)).toBeVisible();
  await page.getByRole("button", { name: "03 Imágenes", exact: true }).click();
  await page.getByLabel("Plantilla de presentación").selectOption("Spotlight");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page.getByRole("button", { name: "Añadir 2D", exact: true }).click();
  await page.getByRole("button", { name: "Añadir 3D", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Crear borrador narrativo local",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Narrativa visual")).toHaveValue(
    /Oceanfront Partner Summit/,
  );
  await page
    .getByLabel("Narrativa visual")
    .fill(
      "La propuesta combina una llegada cálida, un escenario enfocado y una distribución clara para los asistentes.",
    );
  await page
    .getByLabel("Pie de imagen · 1")
    .fill("Concepto visual aprobado para la experiencia del cliente.");
  await expect(
    page.getByRole("button", { name: "Vista previa", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("button", { name: "Vista previa", exact: true }).click();
  await expect(page.locator(".print-visuals figure")).toHaveCount(3);
  await expect(page.locator(".print-proposal")).toContainText(
    "La propuesta combina una llegada cálida",
  );
  await expect(page.locator(".print-proposal")).toContainText(
    "Concepto visual aprobado",
  );
  await expect(page.locator(".print-proposal")).not.toContainText(
    "local-concept-v1",
  );
  await expect(page.locator(".print-proposal")).not.toContainText(
    "Local showcase",
  );
  await page.screenshot({
    path: "artifacts/proposal-visual-phase7.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(page.locator(".print-visuals figure")).toHaveCount(3);
  await page.screenshot({
    path: "artifacts/proposal-visual-phase7-print.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
  await page
    .getByRole("button", { name: "Comparar versiones", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Versión 2");
  await expect(page.getByRole("dialog")).toContainText("Recursos visuales");
  await expect(page.getByRole("dialog")).toContainText("VISTA 3D");
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
  await page.reload();
  await page.getByRole("button", { name: "03 Imágenes", exact: true }).click();
  await expect(page.locator(".proposal-visual-card")).toHaveCount(3);
  await expect(page.getByLabel("Plantilla de presentación")).toHaveValue(
    "Spotlight",
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
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

test("advanced fulfillment packages, crew conflicts, cues, and actual costs persist", async ({
  page,
}) => {
  await page.goto("/inventory");
  await page.getByRole("tab", { name: "Paquetes", exact: true }).click();
  await page
    .getByRole("button", { name: /Add package|Agregar paquete/ })
    .click();
  const packageDialog = page.getByRole("dialog");
  await packageDialog.getByLabel("Nombre del paquete").fill("Kit ejecutivo QA");
  await packageDialog
    .getByRole("button", { name: "Guardar paquete", exact: true })
    .click();
  const packageRow = page
    .locator(".simple-row")
    .filter({ hasText: "Kit ejecutivo QA" });
  await expect(packageRow).toBeVisible();
  await packageRow
    .getByRole("button", { name: "Reservar paquete", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Check and reserve|Verificar y reservar/ })
    .click();
  await expect(
    page.getByText("Package reserved on hold.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Reservas", exact: true }).click();
  const handoffRow = page
    .getByRole("row")
    .filter({ hasText: "QSC K12.2 Active Speaker" })
    .last();
  await handoffRow
    .getByRole("button", { name: "Gestionar entrega", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Estado de entrega")
    .selectOption("Confirmed");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar entrega", exact: true })
    .click();
  await expect(handoffRow).toContainText("Confirmado");
  await handoffRow
    .getByRole("button", { name: "Gestionar entrega", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Estado de entrega")
    .selectOption("Dispatched");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar entrega", exact: true })
    .click();
  await expect(handoffRow).toContainText("Despachado");
  await handoffRow
    .getByRole("button", { name: "Gestionar entrega", exact: true })
    .click();
  const returnDialog = page.getByRole("dialog");
  await returnDialog.getByLabel("Estado de entrega").selectOption("Returned");
  await returnDialog.getByLabel("Devuelto").fill("1");
  await returnDialog
    .getByRole("button", { name: "Guardar entrega", exact: true })
    .click();
  await expect(handoffRow).toBeVisible();
  await expect(handoffRow).toContainText("Devuelto");

  await page.goto("/production?event=e1");
  await page
    .getByRole("tab", { name: "Calendario del equipo", exact: true })
    .click();
  await page.getByRole("button", { name: /Add shift|Agregar turno/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Integrante del equipo")
    .fill("Phase 8 Tech");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Schedule shift|Programar turno/ })
    .click();
  await expect(page.getByText("Phase 8 Tech", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Add shift|Agregar turno/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Integrante del equipo")
    .fill("Phase 8 Tech");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Schedule shift|Programar turno/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("overlapping shift");
  await page
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .click();

  await page
    .getByRole("tab", { name: "Programa del evento", exact: true })
    .click();
  await page.getByRole("button", { name: /Add cue|Agregar cue/ }).click();
  await page.getByRole("dialog").getByLabel("Cue").fill("QA opening cue");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agregar cue", exact: true })
    .click();
  await expect(page.getByText("QA opening cue", { exact: true })).toBeVisible();

  await page
    .getByRole("tab", { name: "Logística y costos", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Add cost|Agregar costo/ })
    .first()
    .click();
  const costDialog = page.getByRole("dialog");
  await costDialog.getByLabel("Monto").fill("175");
  await costDialog.getByLabel("Descripción").fill("Consumibles QA");
  await costDialog
    .getByRole("button", { name: /Record cost|Registrar costo/ })
    .click();
  await expect(page.getByText(/Consumibles QA/)).toBeVisible();
});

test("reports explain their metrics and automation requires human approval", async ({
  page,
}) => {
  await page.goto("/reports");
  await expect(page.getByText("Calidad y cobertura de datos")).toBeVisible();
  await page.getByRole("tab", { name: "Definiciones", exact: true }).click();
  await expect(
    page.getByText("Contribución operativa", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No equivale a ingreso cobrado/)).toBeVisible();

  await page.getByRole("tab", { name: "Automatización", exact: true }).click();
  await page
    .getByRole("button", { name: "Evaluar reglas", exact: true })
    .click();
  const suggestion = page
    .locator(".simple-row")
    .filter({ hasText: "Resolver preparación del evento" })
    .first();
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText("Abierta");
  await page.screenshot({
    path: "artifacts/phase9-reporting-automation.png",
    fullPage: true,
    animations: "disabled",
  });

  await page
    .getByRole("button", { name: "Evaluar reglas", exact: true })
    .click();
  await expect(
    page.getByText(/Las reglas no duplicaron acciones existentes/),
  ).toBeVisible();
  await suggestion
    .getByRole("button", { name: "Aprobar", exact: true })
    .click();
  await expect(suggestion).toContainText("Aprobada");
  await expect(suggestion.getByRole("button", { name: "Aprobar" })).toHaveCount(
    0,
  );

  await page.goto("/production?event=e1");
  await expect(
    page.getByText("Resolver preparación del evento", { exact: true }),
  ).toBeVisible();
});

test("layout object editing, revision saving, undo and 3D rendering", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/design");
  await page.getByRole("button", { name: "Stand", exact: true }).click();
  await page.getByLabel("Etiqueta", { exact: true }).fill("Booth 101");
  await page.getByLabel("Color de superficie").fill("#c25b4a");
  await page.getByLabel("Texto de marca").fill("KIT EXPO");
  await page.getByLabel("Ancho · m", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Guardar versión", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Seleccionar Booth 101", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Seleccionar Booth 101", exact: true })
    .click();
  await expect(page.getByLabel("Texto de marca")).toHaveValue("KIT EXPO");
  await page.reload();
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
  await page
    .getByRole("button", { name: "Seleccionar Booth 101", exact: true })
    .click();
  await page.getByRole("button", { name: "Vista 3D", exact: true }).click();
  await expect(page.getByLabel("Diseño 3D interactivo del evento")).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await expect(
    page.getByText("Seleccionado: Booth 101", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Modelos detallados no asignados", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Guardar cámara", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Exportar imagen", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Guardar versión", exact: true })
    .click();
  const sceneDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar imagen", exact: true })
    .click();
  expect((await sceneDownload).suggestedFilename()).toMatch(
    /scene-layout1-v\d+-vista-1\.png/,
  );
  await page.reload();
  await page.getByRole("button", { name: "Vista 3D", exact: true }).click();
  await expect(page.getByLabel("Diseño 3D interactivo del evento")).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await page
    .getByLabel("Vista de cámara guardada")
    .selectOption({ label: "Vista 1" });
  await expect(page.getByLabel("Vista de cámara guardada")).toHaveValue(/.+/);
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
    page.getByText("Modo de ejemplo: mensajes guardados", { exact: false }),
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
    .getByRole("link", { name: "Proyectos", exact: true })
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
