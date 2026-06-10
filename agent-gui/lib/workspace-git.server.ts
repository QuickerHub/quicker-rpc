import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type WorkspaceFileGitStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "copied"
  | "type_changed"
  | "unknown";

export type WorkspaceChangedFile = {
  path: string;
  status: WorkspaceFileGitStatus;
  /** Present when status is renamed. */
  oldPath?: string;
};

export type WorkspaceGitStatusResult =
  | {
      state: "ok";
      changedFiles: WorkspaceChangedFile[];
    }
  | {
      state: "not-repo";
      changedFiles: WorkspaceChangedFile[];
      error?: string;
    }
  | {
      state: "error";
      changedFiles: WorkspaceChangedFile[];
      error: string;
    };

export type WorkspaceGitDiffResult =
  | { state: "ok"; diff: string }
  | { state: "not-repo"; diff: string; error?: string }
  | { state: "error"; diff: string; error: string };

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function mapPorcelainStatus(
  indexStatus: string,
  workTreeStatus: string,
): WorkspaceFileGitStatus {
  const code = indexStatus !== " " ? indexStatus : workTreeStatus;
  switch (code) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type_changed";
    case "?":
      return "untracked";
    default:
      return "unknown";
  }
}

/** Parse `git status --porcelain` lines (supports rename arrows). */
export function parseGitPorcelain(stdout: string): WorkspaceChangedFile[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const changed: WorkspaceChangedFile[] = [];

  for (const line of lines) {
    if (line.length < 4) continue;
    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";
    const rest = line.slice(3).trim();
    if (!rest) continue;

    const renameMatch = rest.match(/^(.+?)\s+->\s+(.+)$/);
    if (renameMatch) {
      changed.push({
        path: normalizeRepoPath(renameMatch[2]!),
        oldPath: normalizeRepoPath(renameMatch[1]!),
        status: mapPorcelainStatus(indexStatus, workTreeStatus),
      });
      continue;
    }

    changed.push({
      path: normalizeRepoPath(rest),
      status: mapPorcelainStatus(indexStatus, workTreeStatus),
    });
  }

  return changed;
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; notRepo: boolean; message: string }> {
  const resolved = path.resolve(cwd);
  try {
    const { stdout } = await execFileAsync("git", ["-C", resolved, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: stdout ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notRepo =
      /not a git repository/i.test(message)
      || /fatal: not a git repository/i.test(message);
    return { ok: false, notRepo, message };
  }
}

export async function getWorkspaceGitStatus(cwd: string): Promise<WorkspaceGitStatusResult> {
  const trimmed = cwd.trim();
  if (!trimmed) {
    return { state: "error", changedFiles: [], error: "cwd is required" };
  }

  const result = await runGit(trimmed, ["status", "--porcelain"]);
  if (!result.ok) {
    if (result.notRepo) {
      return { state: "not-repo", changedFiles: [], error: result.message };
    }
    return { state: "error", changedFiles: [], error: result.message };
  }

  return {
    state: "ok",
    changedFiles: parseGitPorcelain(result.stdout),
  };
}

export async function getWorkspaceGitDiff(
  cwd: string,
  filePath: string,
): Promise<WorkspaceGitDiffResult> {
  const trimmedCwd = cwd.trim();
  const trimmedPath = filePath.trim().replace(/\\/g, "/");
  if (!trimmedCwd) {
    return { state: "error", diff: "", error: "cwd is required" };
  }
  if (!trimmedPath) {
    return { state: "error", diff: "", error: "path is required" };
  }

  const result = await runGit(trimmedCwd, ["diff", "HEAD", "--", trimmedPath]);
  if (!result.ok) {
    if (result.notRepo) {
      return { state: "not-repo", diff: "", error: result.message };
    }
    return { state: "error", diff: "", error: result.message };
  }

  return { state: "ok", diff: result.stdout };
}
