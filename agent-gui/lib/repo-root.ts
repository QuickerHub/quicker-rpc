import { existsSync } from "node:fs";
import { basename, join } from "node:path";

/** Repo root (directory containing version.json). */
export function resolveRepoRoot(): string {
  const fromEnv = process.env.QKRPC_REPO_ROOT?.trim();
  if (fromEnv && existsSync(join(fromEnv, "version.json"))) {
    return fromEnv;
  }

  let dir = process.cwd();
  if (basename(dir) === "agent-gui") {
    dir = join(dir, "..");
  }
  if (existsSync(join(dir, "version.json"))) {
    return dir;
  }

  const parent = join(dir, "..");
  if (existsSync(join(parent, "version.json"))) {
    return parent;
  }

  return dir;
}
