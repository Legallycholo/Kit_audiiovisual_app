import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { searchWorkspace } from "./search";
it("finds related Rolando projects and proposals without matching their titles", () => {
  const data = createSeed();
  const event = data.events[0];
  const client = data.clients.find((c) => c.id === event.clientId)!;
  client.contact = "Rolando Pérez";
  client.name = "Acme";
  const results = searchWorkspace(data, null, "Rolando");
  expect(
    results.some((r) => r.id === event.id && r.reason.includes("Relacionado")),
  ).toBe(true);
  expect(results.some((r) => r.id === client.id)).toBe(true);
  for (const proposal of data.proposals.filter((p) => p.eventId === event.id))
    expect(results.some((r) => r.id === proposal.id)).toBe(true);
  expect(
    searchWorkspace(data, null, "Perez").some((r) => r.id === client.id),
  ).toBe(true);
});
it("does not interpret HTML or query syntax", () => {
  expect(
    searchWorkspace(createSeed(), null, "<script>alert(1)</script>"),
  ).toEqual([]);
  expect(searchWorkspace(createSeed(), null, "  ")).toEqual([]);
});
