import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import {
  DEV_TEMP_WORKSPACE_REL_DIR,
  type DevTempWorkspaceCleanupResult,
  type DevTempWorkspaceSeed,
  isDevTempWorkspacePath,
  normalizePathForCompare,
} from "@/lib/dev-temp-workspace.shared";

function agentGuiRoot(): string {
  return process.cwd();
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

/** Anchor the entire managed path chain, including .local, to this application. */
async function checkedDevTempWorkspaceRoot(): Promise<string> {
  let directory = await realpath(agentGuiRoot());
  for (const segment of DEV_TEMP_WORKSPACE_REL_DIR.split("/")) {
    directory = join(directory, segment);
    try {
      if (pathKey(await realpath(directory)) !== pathKey(directory)) {
        throw new Error("Dev temp workspace root path is redirected");
      }
    } catch (error) {
      // A missing suffix is safe to create beneath the verified existing parent.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return directory;
}

export function resolveDevTempWorkspaceRoot(): string {
  return resolve(agentGuiRoot(), DEV_TEMP_WORKSPACE_REL_DIR);
}

export function assertDevTempWorkspacePath(path: string): string {
  const absolute = resolve(path.trim());
  const roots = [resolveDevTempWorkspaceRoot(), resolve(realpathSync(agentGuiRoot()), DEV_TEMP_WORKSPACE_REL_DIR)];
  if (!roots.some((root) => pathKey(absolute).startsWith(pathKey(`${root}${sep}`)))) {
    throw new Error("Path is not under dev temp-workspaces root");
  }
  if (!isDevTempWorkspacePath(absolute)) {
    throw new Error("Path is not a dev temp workspace");
  }
  return absolute;
}

async function seedTempWorkspace(targetDir: string, seed: DevTempWorkspaceSeed): Promise<void> {
  if (seed === "empty") {
    await mkdir(join(targetDir, ".quicker"), { recursive: true });
    return;
  }

  const fixtureDir = join(agentGuiRoot(), "benchmarks", "fixtures", "eval-workspace");
  await cp(fixtureDir, targetDir, {
    recursive: true,
    filter: (src) => !src.split(/[/\\]/).includes(".local"),
  });
}

export async function createDevTempWorkspace(options?: {
  seed?: DevTempWorkspaceSeed;
}): Promise<{ path: string; id: string }> {
  if (!isAgentGuiDebugMode()) {
    throw new Error("Dev temp workspaces are only available in development");
  }

  const root = await checkedDevTempWorkspaceRoot();
  await mkdir(root, { recursive: true });
  await checkedDevTempWorkspaceRoot();

  const id = randomUUID();
  const folderName = `ws-${id.slice(0, 8)}`;
  const path = join(root, folderName);
  await mkdir(path, { recursive: true });
  await seedTempWorkspace(path, options?.seed ?? "eval-workspace");

  return { path: resolve(path), id };
}

export async function deleteDevTempWorkspace(path: string): Promise<void> {
  await cleanupDevTempWorkspace(path);
}

export async function cleanupDevTempWorkspace(
  path: string,
): Promise<DevTempWorkspaceCleanupResult> {
  if (!isAgentGuiDebugMode()) {
    throw new Error("Dev temp workspaces are only available in development");
  }

  const absolute = assertDevTempWorkspacePath(path);
  const result: DevTempWorkspaceCleanupResult = {
    path: absolute,
    deletedActions: [],
    deletedSubprograms: [],
    hostArtifactsPreserved: true,
    errors: [],
  };

  // A copied/exported program ID is a reference, not proof that this workspace owns
  // the live host object. Removing local scratch files must never delete that object.
  try {
    const root = await checkedDevTempWorkspaceRoot();
    const actual = await realpath(absolute);
    if (!pathKey(actual).startsWith(pathKey(`${root}${sep}`))) {
      throw new Error("Dev temp workspace resolves outside its managed root");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
    throw error;
  }
  await rm(absolute, { recursive: true, force: true });
  return result;
}

export function pathsMatchDevTempWorkspace(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}
