import type express from "express";
import { HttpError } from "../database";
import { userOf } from "../security";
import { date } from "../schema";
import { availableStock } from "../../src/shared/domain";
import type { RouteContext } from "./context";

export function mountInventoryRoutes(
  app: express.Express,
  { repo }: RouteContext,
) {
  app.get("/api/inventory/availability", (req, res) => {
    const user = userOf(res);
    if (user.role === "Client / Guest")
      throw new HttpError(403, "Inventory is not shared with clients.");
    const start = date.parse(req.query.start);
    const end = date.parse(req.query.end);
    if (end < start) throw new HttpError(422, "Invalid occupied window.");
    const { workspace } = repo.read();
    res.json({
      availability: Object.fromEntries(
        workspace.equipment.map((item) => [
          item.id,
          availableStock(item, workspace.reservations, start, end),
        ]),
      ),
    });
  });
}
