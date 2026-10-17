import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ObjectKind } from "../shared/types";
import { addEquipmentDetail, createShapeAssets } from "./scene-shapes";

const assets = createShapeAssets();
const body = () =>
  new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#b4beb2" }),
  );
// Bounds of the procedural children in the body's unit space.
function detailBounds(mesh: THREE.Mesh) {
  const bounds = new THREE.Box3();
  for (const child of mesh.children) {
    if (!child.userData.procedural) continue;
    const geometry = (child as THREE.Mesh).geometry;
    geometry.computeBoundingBox();
    child.updateMatrix();
    bounds.union(geometry.boundingBox!.clone().applyMatrix4(child.matrix));
  }
  return bounds;
}
const detailed: ObjectKind[] = [
  "Speaker",
  "LED wall",
  "Screen",
  "Light",
  "Truss",
];
const sizes = [
  { width: 0.5, height: 0.8, depth: 0.4 },
  { width: 6, height: 3.5, depth: 0.2 },
  { width: 0.6, height: 0.3, depth: 0.6 },
  { width: 0.3, height: 0.3, depth: 4 },
];

describe("procedural equipment shapes", () => {
  it("stay inside the object's measured box for every size", () => {
    for (const kind of detailed)
      for (const size of sizes) {
        const mesh = body();
        expect(addEquipmentDetail({ kind, ...size }, mesh, assets)).toBe(true);
        const bounds = detailBounds(mesh);
        expect(bounds.isEmpty(), kind).toBe(false);
        for (const axis of ["x", "y", "z"] as const) {
          expect(bounds.min[axis], `${kind} ${axis}`).toBeGreaterThanOrEqual(
            -0.51,
          );
          expect(bounds.max[axis], `${kind} ${axis}`).toBeLessThanOrEqual(0.51);
        }
      }
  });

  it("hide only the body of open structures, which stays selectable", () => {
    for (const kind of detailed) {
      const mesh = body();
      addEquipmentDetail(
        { kind, width: 2, height: 1, depth: 0.5 },
        mesh,
        assets,
      );
      const hidden = !(mesh.material as THREE.Material).visible;
      expect(hidden, kind).toBe(kind === "Light" || kind === "Truss");
      // Raycasting still hits the measured box.
      const ray = new THREE.Raycaster(
        new THREE.Vector3(0, 0, 5),
        new THREE.Vector3(0, 0, -1),
      );
      expect(ray.intersectObject(mesh, false).length, kind).toBeGreaterThan(0);
    }
  });

  it("leaves other kinds unchanged", () => {
    for (const kind of ["Wall", "Table", "Stage", "Chair"] as ObjectKind[]) {
      const mesh = body();
      expect(
        addEquipmentDetail(
          { kind, width: 1, height: 1, depth: 1 },
          mesh,
          assets,
        ),
      ).toBe(false);
      expect(mesh.children).toHaveLength(0);
    }
  });

  it("builds truss chords with lacing along the longest horizontal axis", () => {
    const mesh = body();
    addEquipmentDetail(
      { kind: "Truss", width: 0.3, height: 0.3, depth: 3 },
      mesh,
      assets,
    );
    const chords = mesh.children.filter((child) => child instanceof THREE.Mesh);
    expect(chords).toHaveLength(4);
    for (const chord of chords) expect(chord.scale.z).toBe(1);
    const lacing = mesh.children.find(
      (child) => child instanceof THREE.LineSegments,
    ) as THREE.LineSegments;
    // 4 faces × 6 bays × 2 points per segment.
    expect(lacing.geometry.getAttribute("position").count).toBe(48);
  });

  it("applies a branding surface color to screen faces and keeps a dark frame", () => {
    const mesh = body();
    addEquipmentDetail(
      {
        kind: "Screen",
        width: 4,
        height: 2.25,
        depth: 0.1,
        surfaceColor: "#ff0000",
      },
      mesh,
      assets,
    );
    const faces = mesh.children.filter(
      (child) => child instanceof THREE.Mesh,
    ) as THREE.Mesh[];
    expect(faces).toHaveLength(2);
    expect(
      (faces[0].material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("ff0000");
    expect(
      (mesh.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe(assets.frame.color.getHexString());
  });
});
