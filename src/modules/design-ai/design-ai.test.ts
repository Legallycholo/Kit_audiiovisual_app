import { beforeEach, describe, expect, it } from "vitest";
import { emptyDesignProject, type RoomImage } from "../../shared/kit-design";
import type { Equipment } from "../../shared/types";
import {
  fixtureEngine,
  fixtureSpec,
  guestsFrom,
  type FixturePainter,
} from "./engine";
import {
  addImages,
  applyPending,
  commitFirstVersion,
  currentVersion,
  discardPending,
  nextVersionNumber,
  proposeVersion,
  readProject,
  removeImage,
  resetProjects,
  selectVersion,
  writeProject,
} from "./project";

const image = (n: number): RoomImage => ({
  id: `img-${n}`,
  name: `salon-${n}.jpg`,
  mimeType: "image/jpeg",
  dataUrl: "data:image/jpeg;base64,AA==",
  width: 1600,
  height: 1200,
});

const gear = (id: string, category: string, quantity = 10): Equipment => ({
  id,
  name: `${category} ${id}`,
  category,
  sku: id,
  quantity,
  maintenance: 0,
  rate: 100,
  description: "",
});

const catalog = [
  gear("a1", "Audio"),
  gear("a2", "Audio"),
  gear("l1", "Lighting"),
  gear("s1", "Staging"),
  gear("w1", "LED walls"),
  gear("c1", "Cables"),
];

const painted: string[] = [];
const painter: FixturePainter = async (img, caption, version) => {
  painted.push(`${img.id}:${version}:${caption}`);
  return `data:image/jpeg;base64,v${version}`;
};
const engine = fixtureEngine(painter);

beforeEach(() => {
  painted.length = 0;
  resetProjects();
});

describe("KIT Design fixture engine", () => {
  it("reads the guest count from the brief", () => {
    expect(guestsFrom("Boda para 120 invitados")).toBe(120);
    expect(guestsFrom("Cena de gala")).toBeUndefined();
  });

  it("builds a spec from catalog items, one view per image, with estimated measurements", () => {
    const spec = fixtureSpec(
      "Boda para 120, escenario al fondo",
      [image(1), image(2)],
      catalog,
    );
    expect(spec.room.measured).toBe("estimated");
    expect(spec.views.map((v) => v.sourceImageId)).toEqual(["img-1", "img-2"]);
    const ids = spec.items.flatMap((i) =>
      i.equipmentId ? [i.equipmentId] : [],
    );
    expect(ids).toEqual(["s1", "w1", "l1", "a1"]);
    expect(new Set(ids).size).toBe(ids.length);
    // Tables are décor outside the catalog, sized from the guest count.
    const tables = spec.items.at(-1)!;
    expect(tables.equipmentId).toBeUndefined();
    expect(tables.quantity).toBe(12);
  });

  it("never asks for more units than the catalog has", () => {
    const spec = fixtureSpec(
      "Conferencia",
      [image(1)],
      [gear("a1", "Audio", 1)],
    );
    expect(spec.items).toEqual([
      expect.objectContaining({ equipmentId: "a1", quantity: 1 }),
    ]);
  });

  it("renders every view and marks the renders as fixtures", async () => {
    const result = await engine.create({
      brief: "Boda para 80",
      images: [image(1), image(2)],
      equipment: catalog,
      versionNumber: 1,
    });
    expect(result.renders).toHaveLength(2);
    expect(result.renders.every((r) => r.provider === "fixture")).toBe(true);
    expect(painted).toEqual(["img-1:1:Boda para 80", "img-2:1:Boda para 80"]);
    expect(result.reply).toContain("Vista de muestra");
  });

  it("keeps the room and items when refining, and records the request", async () => {
    const first = await engine.create({
      brief: "Boda para 80",
      images: [image(1)],
      equipment: catalog,
      versionNumber: 1,
    });
    const next = await engine.refine({
      request: "Más luz cálida",
      spec: first.spec,
      images: [image(1)],
      equipment: catalog,
      versionNumber: 2,
    });
    expect(next.spec.items).toEqual(first.spec.items);
    expect(next.spec.style.lighting).toBe("Más luz cálida");
    expect(next.spec.views[0].prompt).toContain("Cambio: Más luz cálida");
    expect(first.spec.views[0].prompt).not.toContain("Cambio");
  });
});

describe("KIT Design project versions", () => {
  const result = async (brief: string, version: number) =>
    engine.create({
      brief,
      images: [image(1)],
      equipment: catalog,
      versionNumber: version,
    });

  it("caps a design at six images and reports the rest", () => {
    const { project, skipped } = addImages(
      emptyDesignProject("e1"),
      [1, 2, 3, 4, 5, 6, 7, 8].map(image),
    );
    expect(project.images).toHaveLength(6);
    expect(skipped).toBe(2);
  });

  it("makes the first design current at once, but holds refinements for Aplicar / Descartar", async () => {
    let project = addImages(emptyDesignProject("e1"), [image(1)]).project;
    project = commitFirstVersion(project, "Boda", await result("Boda", 1));
    expect(currentVersion(project)?.number).toBe(1);

    project = proposeVersion(project, "Más luz", await result("Más luz", 2));
    expect(project.pendingVersion?.number).toBe(2);
    expect(currentVersion(project)?.number).toBe(1);
    expect(nextVersionNumber(project)).toBe(3);

    const discarded = discardPending(project);
    expect(discarded.pendingVersion).toBeUndefined();
    expect(discarded.versions).toHaveLength(1);

    const applied = applyPending(project);
    expect(applied.pendingVersion).toBeUndefined();
    expect(applied.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(currentVersion(applied)?.number).toBe(2);

    // Going back to an earlier version keeps every version.
    const back = selectVersion(applied, applied.versions[0].id);
    expect(currentVersion(back)?.number).toBe(1);
    expect(back.versions).toHaveLength(2);
    expect(selectVersion(back, "missing")).toBe(back);
  });

  it("keeps images once a design exists, because versions depend on them", async () => {
    let project = addImages(emptyDesignProject("e1"), [
      image(1),
      image(2),
    ]).project;
    expect(removeImage(project, "img-2").images).toHaveLength(1);
    project = commitFirstVersion(project, "Boda", await result("Boda", 1));
    expect(removeImage(project, "img-2").images).toHaveLength(2);
  });

  it("keeps one project per event", () => {
    writeProject("e1", (p) => ({ ...p, brief: "uno" }));
    expect(readProject("e1").brief).toBe("uno");
    expect(readProject("e2").brief).toBe("");
  });
});
