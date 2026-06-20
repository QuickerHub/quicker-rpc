import { cp, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import { isQuickerActionMissingError } from "@/lib/action-command-client";
import { listWorkspaceActionProjects } from "@/lib/action-explorer-server";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import { runQkrpc } from "@/lib/qkrpc";
import { isQuickerSubProgramMissingError } from "@/lib/subprogram-command-client";
import { listWorkspaceSubProgramProjects } from "@/lib/subprogram-project-workflow";
import {
  DEV_TEMP_WORKSPACE_REL_DIR,
  type DevTempWorkspaceCleanupResult,
  type DevTempWorkspaceSeed,
  isDevTempWorkspacePath,
  normalizePathForCompare,
} from "@/lib/dev-temp-workspace.shared";

const QKRPC_TIMEOUT_MS = 120_000;

function agentGuiRoot(): string {
  return process.cwd();
}

function formatQkrpcError(result: {
  stderr: string;
  parsed: unknown;
}): string {
  const stderr = result.stderr.trim();
  if (stderr) return stderr;
  if (typeof result.parsed === "object" && result.parsed !== null) {
    const row = result.parsed as Record<string, unknown>;
    const msg = row.message ?? row.errorMessage ?? row.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "qkrpc 命令失败";
}

async function deleteActionInQuicker(actionId: string): Promise<string | undefined> {
  const result = await runQkrpc(
    ["action", "delete", "--id", actionId, "--yes", "--json"],
    { timeoutMs: QKRPC_TIMEOUT_MS },
  );
  if (result.ok) return undefined;
  const error = formatQkrpcError(result);
  if (isQuickerActionMissingError(error)) return undefined;
  return error;
}

async function deleteSubprogramInQuicker(subprogramId: string): Promise<string | undefined> {
  const result = await runQkrpc(
    ["subprogram", "delete", "--id", subprogramId, "--yes", "--json"],
    { timeoutMs: QKRPC_TIMEOUT_MS },
  );
  if (result.ok) return undefined;
  const error = formatQkrpcError(result);
  if (isQuickerSubProgramMissingError(error)) return undefined;
  return error;
}

export async function scanDevTempWorkspaceArtifacts(): Promise<{
  actionIds: string[];
  subprogramIds: string[];
}> {
  const actionIds = new Set<string>();
  const subprogramIds = new Set<string>();

  const actions = await listWorkspaceActionProjects();
  if (actions.ok) {
    for (const project of actions.projects) {
      const id = project.actionId?.trim();
      if (id) actionIds.add(id);
    }
  }

  const subprograms = await listWorkspaceSubProgramProjects();
  if (subprograms.ok) {
    for (const project of subprograms.projects) {
      const id =
        project.subProgramId?.trim()
        || project.callIdentifier?.trim()
        || project.dirName.trim();
      if (id) subprogramIds.add(id);
    }
  }

  return {
    actionIds: [...actionIds],
    subprogramIds: [...subprogramIds],
  };
}

export function resolveDevTempWorkspaceRoot(): string {
  return resolve(agentGuiRoot(), DEV_TEMP_WORKSPACE_REL_DIR);
}

export function assertDevTempWorkspacePath(path: string): string {
  const absolute = resolve(path.trim());
  const root = resolveDevTempWorkspaceRoot();
  const prefix = `${root}${sep}`.toLowerCase();
  if (!absolute.toLowerCase().startsWith(prefix)) {
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

  const root = resolveDevTempWorkspaceRoot();
  await mkdir(root, { recursive: true });

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
    errors: [],
  };

  await runWithAgentRequestContextAsync({ cwd: absolute }, async () => {
    const artifacts = await scanDevTempWorkspaceArtifacts();

    for (const actionId of artifacts.actionIds) {
      const error = await deleteActionInQuicker(actionId);
      if (error) {
        result.errors.push(`Quicker ${actionId.slice(0, 8)}…: ${error}`);
      } else {
        result.deletedActions.push(actionId);
      }
    }

    for (const subprogramId of artifacts.subprogramIds) {
      const error = await deleteSubprogramInQuicker(subprogramId);
      if (error) {
        result.errors.push(`Quicker SP ${subprogramId.slice(0, 12)}: ${error}`);
      } else {
        result.deletedSubprograms.push(subprogramId);
      }
    }
  });

  await rm(absolute, { recursive: true, force: true });
  return result;
}

export function pathsMatchDevTempWorkspace(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}
