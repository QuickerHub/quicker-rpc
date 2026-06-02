import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

/** Release default: Documents/QuickerAgent (created on first resolve). */
export function resolveReleaseDefaultWorkingDirectory(): string {
  const dir = join(resolveUserDocumentsDirectory(), RELEASE_WORKSPACE_DIRNAME);
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

  const repo = resolveQuickerRpcRepoRoot();
  if (repo) return repo;

  return resolveReleaseDefaultWorkingDirectory();
}

export function getDefaultWorkingDirectoryProfile(): DefaultWorkingDirectoryProfile {
  if (process.env.AGENT_GUI_DEFAULT_CWD?.trim()) return "env";
  if (resolveQuickerRpcRepoRoot()) return "repo";
  return "documents";
}

/** True when Node runs from the Tauri / standalone app bundle (not a git checkout). */
export function isBundledAgentRuntime(): boolean {
  if (process.env.AGENT_GUI_BUNDLED === "1") return true;
  const cwd = process.cwd();
  return existsSync(join(cwd, "server.js")) && !isQuickerRpcRepoRoot(cwd);
}
