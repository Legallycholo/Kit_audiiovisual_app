import { ToolRegistry } from "../tools";
import { proposalTools } from "./proposals";
import { recordTools } from "./records";
import { directoryTools } from "./directory";

/** The tools KIT offers today. Future agents register more here. */
export function defaultToolRegistry() {
  return new ToolRegistry().register(
    ...proposalTools,
    ...recordTools,
    ...directoryTools,
  );
}
export { proposalTools, recordTools, directoryTools };
