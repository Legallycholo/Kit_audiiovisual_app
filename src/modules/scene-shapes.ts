import * as THREE from "three";
import type { LayoutObject } from "../shared/types";

// Generic procedural shapes for common rented equipment. They stay inside the
// object's measured box (the parent mesh is a unit box scaled to width × height ×
// depth), so 2D and 3D share the same footprint. They are recognizable
// approximate shapes, not manufacturer models, and make no photometric or
// acoustic claim.

export type ShapeAssets = ReturnType<typeof createShapeAssets>;

export function createShapeAssets() {
  const standard = (
    color: string,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    // Unit cylinder with its axis along z (facing the front of the object).
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28).rotateX(Math.PI / 2),
    plane: new THREE.PlaneGeometry(1, 1),
    cabinet: standard("#2c3237"),
    cone: standard("#15191c", { roughness: 0.85 }),
    frame: standard("#2b3238", { metalness: 0.2 }),
    led: standard("#1f5a7a", {
      emissive: "#1d4f73",
      emissiveIntensity: 0.6,
      roughness: 0.35,
    }),
    screen: standard("#f4f6f2", { roughness: 0.95 }),
    fixture: standard("#262b2f", { metalness: 0.3 }),
    lens: standard("#fff1c2", { emissive: "#ffd36a", emissiveIntensity: 0.8 }),
    metal: standard("#9aa6ab", { metalness: 0.6, roughness: 0.35 }),
    seam: new THREE.LineBasicMaterial({
      color: "#0d1a24",
      transparent: true,
      opacity: 0.55,
    }),
    lacing: new THREE.LineBasicMaterial({ color: "#6f7c82" }),
  };
}

const EPSILON = 0.002;

function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.userData.procedural = true;
  parent.add(mesh);
  return mesh;
}

function lines(
  parent: THREE.Object3D,
  points: number[],
  material: THREE.LineBasicMaterial,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  const segments = new THREE.LineSegments(geometry, material);
  segments.userData.procedural = true;
  parent.add(segments);
  return segments;
}

/**
 * Adds detail to `body` (a unit box scaled to the object). Returns false for kinds
 * without a procedural shape. For open structures the body stays raycastable for
 * selection but is not drawn.
 */
export function addEquipmentDetail(
  object: Pick<
    LayoutObject,
    "kind" | "width" | "height" | "depth" | "surfaceColor"
  >,
  body: THREE.Mesh,
  assets: ShapeAssets,
): boolean {
  const w = Math.max(0.01, object.width);
  const h = Math.max(0.1, object.height);
  const d = Math.max(0.01, object.depth);
  // Child scale that yields `size` meters in world space along each axis.
  const meters = (
    x: number,
    y: number,
    z: number,
  ): [number, number, number] => [x / w, y / h, z / d];
  const hideBody = () => {
    (body.material as THREE.Material).visible = false;
  };
  switch (object.kind) {
    case "Speaker": {
      const face = Math.min(w, h);
      // Cones are 2 cm deep with their front flush with the cabinet face.
      const front = 0.5 - 0.01 / d + EPSILON;
      part(
        body,
        assets.disc,
        assets.cone,
        [0, -0.18, front],
        meters(face * 0.62, face * 0.62, 0.02),
      );
      part(
        body,
        assets.disc,
        assets.cone,
        [0, 0.3, front],
        meters(face * 0.22, face * 0.22, 0.02),
      );
      return true;
    }
    case "LED wall":
    case "Screen": {
      const led = object.kind === "LED wall";
      const material = object.surfaceColor
        ? new THREE.MeshStandardMaterial({
            color: object.surfaceColor,
            ...(led
              ? { emissive: object.surfaceColor, emissiveIntensity: 0.35 }
              : {}),
          })
        : led
          ? assets.led
          : assets.screen;
      (body.material as THREE.MeshStandardMaterial).color.set(
        assets.frame.color,
      );
      for (const side of [1, -1]) {
        const face = part(
          body,
          assets.plane,
          material,
          [0, 0, side * (0.5 + EPSILON)],
          [0.94, 0.92, 1],
        );
        if (side < 0) face.rotation.y = Math.PI;
      }
      if (led) {
        // Panel seams roughly every 0.5 m, on both faces.
        const columns = Math.max(1, Math.round(w / 0.5));
        const rows = Math.max(1, Math.round(h / 0.5));
        const points: number[] = [];
        for (const z of [0.5 + 2 * EPSILON, -0.5 - 2 * EPSILON]) {
          for (let i = 1; i < columns; i++) {
            const x = -0.47 + (0.94 * i) / columns;
            points.push(x, -0.46, z, x, 0.46, z);
          }
          for (let j = 1; j < rows; j++) {
            const y = -0.46 + (0.92 * j) / rows;
            points.push(-0.47, y, z, 0.47, y, z);
          }
        }
        if (points.length) lines(body, points, assets.seam);
      }
      return true;
    }
    case "Light": {
      hideBody();
      part(body, assets.box, assets.fixture, [0, -0.39, 0], [0.9, 0.22, 0.9]);
      for (const side of [-1, 1])
        part(
          body,
          assets.box,
          assets.fixture,
          [side * 0.38, -0.06, 0],
          [0.1, 0.46, 0.24],
        );
      // Head diameter is limited so it stays inside the measured box.
      const head = Math.min(Math.min(w, d) * 0.62, h * 0.6);
      const headDepth = Math.min(d, h) * 0.6;
      part(
        body,
        assets.disc,
        assets.fixture,
        [0, 0.16, 0],
        meters(head, head, headDepth),
      );
      part(
        body,
        assets.disc,
        assets.lens,
        [0, 0.16, (headDepth / 2 + 0.005) / d],
        meters(head * 0.8, head * 0.8, 0.01),
      );
      return true;
    }
    case "Truss": {
      hideBody();
      const alongX = w >= d;
      const tube = 0.05;
      const across = alongX ? d : w;
      const offsetY = 0.5 - tube / h / 2;
      const offsetAcross = 0.5 - tube / across / 2;
      for (const y of [offsetY, -offsetY])
        for (const a of [offsetAcross, -offsetAcross])
          part(
            body,
            assets.box,
            assets.metal,
            alongX ? [0, y, a] : [a, y, 0],
            alongX ? [1, tube / h, tube / d] : [tube / w, tube / h, 1],
          );
      // Zig-zag lacing on all four long faces.
      const length = alongX ? w : d;
      const bays = Math.max(2, Math.round(length / 0.5));
      const points: number[] = [];
      const point = (along: number, y: number, a: number) =>
        alongX ? [along, y, a] : [a, y, along];
      const zigzag = (at: (i: number) => [number, number]) => {
        for (let i = 0; i < bays; i++)
          points.push(
            ...point(-0.5 + i / bays, ...at(i)),
            ...point(-0.5 + (i + 1) / bays, ...at(i + 1)),
          );
      };
      const alternate = (i: number) => (i % 2 === 0 ? -0.5 : 0.5);
      for (const y of [0.5, -0.5]) zigzag((i) => [y, alternate(i)]); // top, bottom
      for (const a of [0.5, -0.5]) zigzag((i) => [alternate(i), a]); // sides
      lines(body, points, assets.lacing);
      return true;
    }
    default:
      return false;
  }
}
