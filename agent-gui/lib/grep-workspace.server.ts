import "server-only";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import {
  applyGrepHeadLimit,
  buildRipgrepArgs,
  DEFAULT_GREP_HEAD_LIMIT,
  type GrepWorkspaceMatch,
  type GrepWorkspaceOptions,
  type GrepWorkspaceResult,
  MAX_GREP_HEAD_LIMIT,
  parsePlainCountLine,
  parseRipgrepJsonLine,
} from "@/lib/grep-workspace-core";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";

const { resolveRgBin } = require("./rg-bin.mjs") as {
  resolveRgBin: (agentGuiRoot: string) => string | null;
};

export {
  DEFAULT_GREP_HEAD_LIMIT,
  MAX_GREP_HEAD_LIMIT,
  buildRipgrepArgs,
  parseRipgrepJsonLine,
} from "@/lib/grep-workspace-core";

const RG_TIMEOUT_MS = 60_000;

function runRipgrepProcess(
  rgBin: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(rgBin, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`ripgrep timed out after ${RG_TIMEOUT_MS}ms`));
    }, RG_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

export async function grepWorkspace(
  options: GrepWorkspaceOptions,
): Promise<GrepWorkspaceResult> {
  const pattern = options.pattern?.trim();
  if (!pattern) {
    return { ok: false, error: "pattern is required." };
  }

  const rgBin = resolveRgBin(resolveAgentGuiRoot());
  if (!rgBin) {
    return {
      ok: false,
      error:
        "ripgrep (rg) not found. Install rg or use Read({ action: \"search\" }) for literal search in one path.",
    };
  }

  const searchPath = options.path?.trim() || ".";
  const resolved = resolveWorkspacePath(searchPath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `path not found: ${resolved.relative}` };
  }

  const root = resolveWorkspaceRoot();
  const searchRelative =
    resolved.relative === "." || resolved.relative === ""
      ? "."
      : resolved.relative.replace(/\\/g, "/");

  const outputMode = options.outputMode ?? "content";
  const headLimit = Math.min(
    Math.max(1, options.headLimit ?? DEFAULT_GREP_HEAD_LIMIT),
    MAX_GREP_HEAD_LIMIT,
  );
  const offset = Math.max(0, options.offset ?? 0);
  const args = buildRipgrepArgs(options, searchRelative);

  try {
    const { stdout, stderr, exitCode } = await runRipgrepProcess(rgBin, args, root);
    if (exitCode !== 0 && exitCode !== 1) {
      const message = stderr.trim() || stdout.trim() || `ripgrep exited with code ${exitCode}`;
      return { ok: false, error: message };
    }

    if (outputMode === "content") {
      const allMatches: GrepWorkspaceMatch[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const match = parseRipgrepJsonLine(line, root);
        if (match) allMatches.push(match);
      }
      const limited = applyGrepHeadLimit(allMatches, headLimit, offset);
      return {
        ok: true,
        pattern,
        searchPath: resolved.relative,
        outputMode,
        matches: limited.items,
        truncated: limited.truncated,
        totalMatches: limited.totalMatches,
      };
    }

    if (outputMode === "files_with_matches") {
      const files = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((absPath) =>
          absPath.startsWith(root)
            ? relative(root, absPath).replace(/\\/g, "/")
            : absPath.replace(/\\/g, "/"),
        )
        .map((path) => ({ path }));
      const limited = applyGrepHeadLimit(files, headLimit, offset);
      return {
        ok: true,
        pattern,
        searchPath: resolved.relative,
        outputMode,
        matches: limited.items,
        truncated: limited.truncated,
        totalMatches: limited.totalMatches,
      };
    }

    const counts = stdout
      .split(/\r?\n/)
      .map((line) => parsePlainCountLine(line, root))
      .filter((item): item is GrepWorkspaceMatch => item != null);
    const limited = applyGrepHeadLimit(counts, headLimit, offset);
    return {
      ok: true,
      pattern,
      searchPath: resolved.relative,
      outputMode,
      matches: limited.items,
      truncated: limited.truncated,
      totalMatches: limited.totalMatches,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
