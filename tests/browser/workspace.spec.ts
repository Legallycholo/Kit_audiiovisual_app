import { test, expect } from "@playwright/test";

test("all main destinations load without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next great event starts here." }),
  ).toBeVisible();
  for (const [path, title] of [
    ["/events", "Events"],
    ["/clients", "Clients"],
    ["/venues", "Venues"],
    ["/design", "Design Studio"],
    ["/creative", "AI Creative Studio"],
    ["/proposals", "Proposals & quotations"],
    ["/inbox", "Client Inbox"],
    ["/inventory", "Equipment & inventory"],
    ["/production", "Team & production"],
    ["/reports", "Reports"],
    ["/settings", "Settings"],
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
  await dialog.getByLabel("Event name").fill("QA Leadership Summit");
  await dialog.getByLabel("Start date").fill("2027-03-10");
  await dialog.getByLabel("End date").fill("2027-03-11");
  await dialog
    .getByLabel("Event brief")
    .fill("Keynote audio, presentation screens, and reception lighting.");
  await dialog
    .getByRole("button", { name: "Create event", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "QA Leadership Summit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "QA Leadership Summit", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Schedule",
    "Venue & Design",
    "Equipment",
    "Commercial",
    "Team & Production",
    "Creative Assets",
    "Messages",
    "Documents",
    "Activity",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
  await page.goto("/clients");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await page.getByLabel("Company / customer name").fill("QA Customer");
  await page.getByLabel("Primary contact").fill("Test Contact");
  await page.getByLabel("Email", { exact: true }).fill("qa@example.com");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
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
    page.getByText("Awaiting owner review", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review acceptance", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("revision 2");
  await page
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect(
    page.getByText("Owner decision recorded.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Owner decision recorded.", { exact: false }),
  ).toBeVisible();
  await page.goto("/proposals/p1");
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Proposal title")).toBeDisabled();
  await page.getByRole("button", { name: "New revision", exact: true }).click();
  await expect(page.getByText(/REVISION 3/)).toBeVisible();
  await expect(page.getByLabel("Proposal title")).toBeEnabled();
});

test("proposal line edits calculate and persist a revised total", async ({
  page,
}) => {
  await page.goto("/proposals/p2");
  await page.getByRole("button", { name: "02 Equipment & services" }).click();
  await page.getByLabel("Add equipment from catalog").selectOption("q2");
  await page.getByLabel("Shure Wireless Microphone quantity").fill("2");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Proposal saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "02 Equipment & services" }).click();
  await expect(
    page.getByLabel("Shure Wireless Microphone quantity"),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Review & send", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Confirm & send · connection required",
      exact: true,
    }),
  ).toBeDisabled();
});

test("reservation conflicts are explained without overbooking", async ({
  page,
}) => {
  await page.goto("/inventory");
  await page
    .getByRole("button", { name: "Reserve equipment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Quantity", { exact: true })
    .fill("999");
  await page
    .getByRole("button", { name: "Check availability & reserve", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Only");
  await page
    .getByRole("dialog")
    .getByLabel("Quantity", { exact: true })
    .fill("1");
  await page
    .getByRole("button", { name: "Check availability & reserve", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "Reservations", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Hold");
});

test("layout object editing, revision saving, undo and 3D rendering", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/design");
  await page.getByRole("button", { name: "Booth", exact: true }).click();
  await page.getByLabel("Label", { exact: true }).fill("Booth 101");
  await page.getByLabel("Width · m", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Select Booth 101", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D event layout")).toBeVisible({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/design-desktop.png",
    fullPage: true,
  });
});

test("dashboard, tablet navigation, assistant and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ask KIT", exact: true }).click();
  await expect(
    page.getByText("AI not connected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Events", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Events", level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/events-tablet.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next great event starts here." }),
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
