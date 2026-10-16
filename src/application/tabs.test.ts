import { describe, expect, it } from "vitest";
import { canonicalRoute, emptySession, openTab, readSession } from "./tabs";
describe("workspace sessions", () => {
  it("canonicalizes query ordering and ignores transient creation flags", () => {
    expect(canonicalRoute("/design?event=e1&view=3d&new=1")).toBe(
      canonicalRoute("/design?view=3d&event=e1"),
    );
  });
  it("deduplicates resources and preserves history", () => {
    let state = openTab(emptySession(), "/events/e1", "Event");
    state = openTab(state, "/clients", "Clients");
    state = openTab(state, "/events/e1", "Event");
    expect(state.tabs).toHaveLength(2);
    expect(state.history).toHaveLength(3);
    expect(state.active).toBe(state.tabs[0].id);
  });
  it("replaces only preview tabs and preserves pinned resources", () => {
    let state = openTab(emptySession(), "/events/e1", "First", true);
    state.tabs[0].pinned = true;
    state = openTab(state, "/events/e2", "Second", true);
    state = openTab(state, "/events/e3", "Third", true);
    expect(state.tabs.map((t) => t.title)).toEqual(["First", "Third"]);
  });
  it("rejects corrupt snapshots and unsafe restored routes", () => {
    expect(readSession("not json")).toEqual(emptySession());
    const state = openTab(emptySession(), "/", "Home");
    state.tabs[0].route = "https://evil.example";
    expect(readSession(JSON.stringify(state)).tabs).toEqual([]);
  });
});
