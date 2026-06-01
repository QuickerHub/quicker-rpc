import { basename, join } from "node:path";

/** Directory containing agent-gui package (when cwd is repo root or agent-gui). */
export function resolveAgentGuiRoot(): string {
  const cwd = process.cwd();
  return basename(cwd) === "agent-gui" ? cwd : join(cwd, "agent-gui");
}
