import { describe, expect, it } from "vitest";
import type { WorkspaceUser } from "../shared/access";
import {
  activeDestination,
  destinations,
  pageLabel,
  paletteDestinations,
  visibleDestinations,
  visibleSettingsSections,
} from "./navigation";

const person = (role: WorkspaceUser["role"]): WorkspaceUser => ({
  id: "u",
  name: "Test",
  email: "t@example.com",
  role,
  isOwner: false,
  active: true,
  eventIds: [],
  sharedProposalIds: [],
});

// Routes declared in App.tsx. Every navigation entry must resolve to one.
const routes = [
  "/",
  "/events",
  "/clients",
  "/venues",
  "/design",
  "/creative",
  "/proposals",
  "/inbox",
  "/inventory",
  "/production",
  "/reports",
  "/library/files",
  "/kit",
  "/settings/general",
  "/settings/users",
  "/settings/integrations",
  "/settings/appearance",
  "/settings/data",
];

describe("navigation config", () => {
  it("has six destinations and every entry points to a real route", () => {
    expect(destinations.map((d) => d.label)).toEqual([
      "Inicio",
      "Eventos",
      "Ventas",
      "Diseño",
      "Recursos",
      "KIT",
    ]);
    const targets = [
      ...destinations.flatMap((d) => [
        d.to,
        ...(d.children ?? []).map((c) => c.to),
      ]),
      ...visibleSettingsSections(null, "company").map((s) => s.to),
    ];
    for (const to of targets) expect(routes).toContain(to);
  });

  it("shows everything to administrators", () => {
    expect(visibleDestinations(null)).toHaveLength(6);
    expect(visibleDestinations(person("Administrator"))).toHaveLength(6);
  });

  it("hides destinations whose routes a role cannot open", () => {
    const technician = visibleDestinations(person("Technician"));
    expect(technician.map((d) => d.id)).toEqual([
      "home",
      "events",
      "design",
      "resources",
      "kit",
    ]);
    // Technicians cannot open reports: Inicio collapses to its only child.
    const home = technician.find((d) => d.id === "home")!;
    expect(home.children).toBeUndefined();
    expect(home.to).toBe("/");
    // Creative studio is not available to technicians.
    expect(technician.find((d) => d.id === "design")!.children).toBeUndefined();
  });

  it("links a parent with one visible child straight to that child", () => {
    const guest = visibleDestinations(person("Client / Guest"));
    expect(guest.map((d) => d.id)).toEqual(["home", "sales"]);
    const sales = guest.find((d) => d.id === "sales")!;
    expect(sales.children).toBeUndefined();
    expect(sales.to).toBe("/proposals");
  });

  it("limits settings to the person's account for non-administrators", () => {
    expect(
      visibleSettingsSections(person("Sales Manager"), "company").map(
        (s) => s.id,
      ),
    ).toEqual(["users", "appearance"]);
    expect(
      visibleSettingsSections(person("Administrator"), "company"),
    ).toHaveLength(5);
  });

  it("resolves the active destination and page label", () => {
    expect(activeDestination("/inbox")?.id).toBe("sales");
    expect(activeDestination("/events/e1")?.id).toBe("events");
    expect(activeDestination("/files/abc")?.id).toBe("resources");
    expect(activeDestination("/settings/appearance")?.id).toBe("settings");
    expect(pageLabel("/inbox")).toBe("Mensajes");
    expect(pageLabel("/")).toBe("Inicio");
    expect(pageLabel("/settings/integrations")).toBe("Integraciones");
  });

  it("offers only permitted pages in the palette", () => {
    const pages = paletteDestinations(person("Technician"), "company").map(
      (p) => p.to,
    );
    expect(pages).not.toContain("/proposals");
    expect(pages).toContain("/production");
    expect(pages).toContain("/settings/appearance");
  });
});
