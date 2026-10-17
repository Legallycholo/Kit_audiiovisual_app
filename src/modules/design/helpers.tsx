import { lazy } from "react";
import type { Layout, ObjectKind } from "../../shared/types";

export const Scene = lazy(() => import("../Scene"));
export const palette: Record<string, string> = {
  Wall: "#8c9890",
  Door: "#b89070",
  Window: "#76a9bd",
  Stage: "#667c70",
  Table: "#c7d4bd",
  Chair: "#c6d3dc",
  Booth: "#d3c9e1",
  "LED wall": "#7599b0",
  Speaker: "#606777",
  Light: "#e2c883",
  Truss: "#a8afb2",
  Exit: "#b3d1bd",
  Screen: "#95bacb",
  Decoration: "#c7ad9b",
};
export const kinds: ObjectKind[] = [
  "Wall",
  "Door",
  "Window",
  "Stage",
  "Table",
  "Chair",
  "Booth",
  "LED wall",
  "Speaker",
  "Light",
  "Truss",
  "Exit",
  "Screen",
  "Decoration",
];
export const layoutDraftKey = (layoutId: string) =>
  `kit.layout-draft.${layoutId}`;
export const editableLayout = (layout: Layout) => ({
  name: layout.name,
  width: layout.width,
  depth: layout.depth,
  objects: layout.objects,
  verified: layout.verified,
  verifiedAt: layout.verifiedAt,
  verificationNote: layout.verificationNote,
  reference: layout.reference,
  cameras: layout.cameras,
  cameraPath: layout.cameraPath,
  provenance: layout.provenance,
});
