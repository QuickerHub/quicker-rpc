import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";

/** Directory containing quicker-rpc `version.json`. */
export function isQuickerRpcRepoRoot(dir: string): boolean {
  return existsSync(join(dir, "version.json"));
}

/** quicker-rpc monorepo root, or null when running from an install bundle only. */
export function resolveQuickerRpcRepoRoot(): string | null {
  const fromEnv = process.env.QKRPC_REPO_ROOT?.trim();
  if (fromEnv && isQuickerRpcRepoRoot(fromEnv)) {
    return fromEnv;
  }

  let dir = process.cwd();
  if (basename(dir) === "agent-gui") {
    dir = join(dir, "..");
  }
  if (isQuickerRpcRepoRoot(dir)) {
    return dir;
  }

  const parent = join(dir, "..");
  if (isQuickerRpcRepoRoot(parent)) {
    return parent;
  }

  return null;
}

/**
 * Root for repo-scoped assets (e.g. authoring docs in dev).
 * Falls back to agent-gui / bundle runtime when not in a checkout.
 */
export function resolveRepoRoot(): string {
  return resolveQuickerRpcRepoRoot() ?? resolveAgentGuiRoot();
}
