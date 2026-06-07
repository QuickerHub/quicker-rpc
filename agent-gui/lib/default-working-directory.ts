import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { isQuickerRpcRepoRoot, resolveQuickerRpcRepoRoot } from "@/lib/repo-root";
import {
  resolveReleaseDefaultWorkingDirectory,
  resolveUserDocumentsDirectory,
} from "@/lib/quicker-agent-paths";

export type DefaultWorkingDirectoryProfile = "env" | "repo" | "documents";

export {
  resolveReleaseDefaultWorkingDirectory,
  resolveUserDocumentsDirectory,
} from "@/lib/quicker-agent-paths";

/** Ensure release workspace exists (call from API/runtime only, not during `next build`). */
export function ensureReleaseWorkspaceDirectory(): string {
  const dir = resolveReleaseDefaultWorkingDirectory();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Default qkrpc / agent working directory when the user leaves workspace empty.
 * - Dev (quicker-rpc checkout): repo root (parent of agent-gui, has version.json)
 * - Release (Tauri bundle): Documents/QuickerAgent/workspace
 * - Override: AGENT_GUI_DEFAULT_CWD
 */
export function resolveDefaultWorkingDirectory(): string {
  const explicit = process.env.AGENT_GUI_DEFAULT_CWD?.trim();
  if (explicit) return explicit;

  if (isBundledAgentRuntime()) {
    return ensureReleaseWorkspaceDirectory();
  }

  const repo = resolveQuickerRpcRepoRoot();
  if (repo) return repo;

  if (process.env.CI === "true" || process.env.CI === "1") {
    return process.cwd();
  }

  return ensureReleaseWorkspaceDirectory();
}

/** Sidebar / request cwd when set; otherwise server default workspace root. */
export function resolveEffectiveWorkingDirectory(
  override?: string | null,
): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  return resolveDefaultWorkingDirectory();
}

export function getDefaultWorkingDirectoryProfile(): DefaultWorkingDirectoryProfile {
  if (process.env.AGENT_GUI_DEFAULT_CWD?.trim()) return "env";
  if (isBundledAgentRuntime()) return "documents";
  if (resolveQuickerRpcRepoRoot()) return "repo";
  return "documents";
}

/** True when Node runs from the Tauri / standalone app bundle (not a git checkout). */
export function isBundledAgentRuntime(): boolean {
  if (process.env.AGENT_GUI_BUNDLED === "1") return true;
  const cwd = process.cwd();
  if (!existsSync(join(cwd, "server.js"))) return false;
  // Local standalone build under agent-gui/ inside the monorepo is still dev, not release.
  if (basename(cwd) === "agent-gui" && isQuickerRpcRepoRoot(join(cwd, ".."))) {
    return false;
  }
  return true;
}
