import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { isQuickerRpcRepoRoot, resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

export type DefaultWorkingDirectoryProfile = "env" | "repo" | "documents";

const RELEASE_WORKSPACE_DIRNAME = "QuickerAgent";

/** User Documents folder (OS-specific). */
export function resolveUserDocumentsDirectory(): string {
  const home = process.env.USERPROFILE?.trim() || homedir();
  const oneDrive = process.env.OneDrive?.trim();
  if (process.platform === "win32") {
    const docs = join(home, "Documents");
    if (existsSync(docs)) return docs;
    if (oneDrive && existsSync(join(oneDrive, "Documents"))) {
      return join(oneDrive, "Documents");
    }
    return docs;
  }
  const xdg = process.env.XDG_DOCUMENTS_DIR?.trim();
  if (xdg && existsSync(xdg)) return xdg;
  return join(homedir(), "Documents");
}

/** Release default: Documents/QuickerAgent (directory created on demand, not at module load). */
export function resolveReleaseDefaultWorkingDirectory(): string {
  return join(resolveUserDocumentsDirectory(), RELEASE_WORKSPACE_DIRNAME);
}

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
 * - Release (Tauri bundle): Documents/QuickerAgent
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
