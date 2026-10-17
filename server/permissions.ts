// Server-side read scoping and write validation for workspace records.
export { hasAllEvents, ownsEvent, scopeWorkspace } from "./policy/scope";
export { applyChanges } from "./policy/changes";
export { validateWorkspace } from "./policy/validation";
