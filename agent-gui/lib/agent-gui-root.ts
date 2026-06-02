import { existsSync } from "node:fs";
import { basename, join } from "node:path";

/** Directory containing agent-gui package (when cwd is repo root or agent-gui). */
export function resolveAgentGuiRoot(): string {
  const cwd = process.cwd();
  if (basename(cwd) === "agent-gui") return cwd;
  const nested = join(cwd, "agent-gui");
  if (existsSync(join(nested, "package.json"))) return nested;
  // Bundled Next standalone (Tauri): process cwd is resources/app
  if (existsSync(join(cwd, "server.js"))) return cwd;
  return nested;
}
