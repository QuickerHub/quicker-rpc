import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { resolveDefaultWorkingDirectory } from "@/lib/default-working-directory";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { evaluateShellPolicy } from "@/lib/shell-policy";
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_OUTPUT_CHARS,
  MAX_SHELL_TIMEOUT_MS,
  type ShellKind,
  type ShellRunRequest,
  type ShellRunResult,
} from "@/lib/shell-types";
import { resolveWorkspacePath } from "@/lib/workspace-fs";

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_SHELL_OUTPUT_CHARS) {
    return { text, truncated: false };
  }
  const head = text.slice(0, MAX_SHELL_OUTPUT_CHARS);
  return {
    text: `${head}\n\n…[truncated ${text.length - MAX_SHELL_OUTPUT_CHARS} chars]`,
    truncated: true,
  };
}

function resolveShellCwd(override?: string): string {
  const base = getRequestCwd()?.trim() || resolveDefaultWorkingDirectory();
  const trimmed = override?.trim();
  if (!trimmed) return base;

  if (isAbsolute(trimmed)) {
    if (!existsSync(trimmed)) {
      throw new Error(`cwd not found: ${trimmed}`);
    }
    return resolve(trimmed);
  }

  const resolved = resolveWorkspacePath(trimmed);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  if (!existsSync(resolved.absolute)) {
    throw new Error(`cwd not found: ${resolved.relative}`);
  }
  return resolved.absolute;
}

function resolveEffectiveShell(requested: ShellKind | undefined): Exclude<ShellKind, "auto"> {
  const kind = requested ?? "auto";
  if (kind !== "auto") return kind;
  if (process.platform === "win32") return "powershell";
  return "bash";
}

function resolvePowershellExecutable(): string {
  const candidates = [
    process.env.AGENT_GUI_POWERSHELL?.trim(),
    "pwsh",
    "powershell",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    return candidate;
  }
  return "powershell";
}

export type ShellInvocation = {
  executable: string;
  args: string[];
  shell: Exclude<ShellKind, "auto">;
  commandLine: string;
};

export function buildShellInvocation(
  shell: Exclude<ShellKind, "auto">,
  command: string,
): ShellInvocation {
  if (process.platform === "win32") {
    if (shell === "cmd") {
      const args = ["/d", "/s", "/c", command];
      return {
        executable: process.env.ComSpec?.trim() || "cmd.exe",
        args,
        shell,
        commandLine: `${basename(process.env.ComSpec || "cmd.exe")} ${args.join(" ")}`,
      };
    }
    const executable = resolvePowershellExecutable();
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ];
    return {
      executable,
      args,
      shell: "powershell",
      commandLine: `${basename(executable)} -Command ${command}`,
    };
  }

  if (shell === "cmd") {
    throw new Error("cmd shell is only supported on Windows");
  }

  const args = ["-lc", command];
  return {
    executable: "bash",
    args,
    shell: "bash",
    commandLine: `bash -lc ${command}`,
  };
}

export function buildScriptFileInvocation(
  shell: Exclude<ShellKind, "auto">,
  scriptAbsolutePath: string,
  args: string[] = [],
): ShellInvocation {
  if (process.platform === "win32") {
    if (shell === "cmd") {
      const cmdArgs = ["/d", "/s", "/c", scriptAbsolutePath, ...args];
      return {
        executable: process.env.ComSpec?.trim() || "cmd.exe",
        args: cmdArgs,
        shell,
        commandLine: `${basename(process.env.ComSpec || "cmd.exe")} ${cmdArgs.join(" ")}`,
      };
    }
    const executable = resolvePowershellExecutable();
    const psArgs = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptAbsolutePath,
      ...args,
    ];
    return {
      executable,
      args: psArgs,
      shell: "powershell",
      commandLine: `${basename(executable)} -File ${scriptAbsolutePath}${args.length ? ` ${args.join(" ")}` : ""}`,
    };
  }

  const bashArgs = [scriptAbsolutePath, ...args];
  return {
    executable: "bash",
    args: bashArgs,
    shell: "bash",
    commandLine: `bash ${bashArgs.join(" ")}`,
  };
}

function normalizeTimeout(timeoutMs?: number): number {
  const value = timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;
  return Math.min(Math.max(1_000, Math.floor(value)), MAX_SHELL_TIMEOUT_MS);
}

async function runProcess(
  invocation: ShellInvocation,
  cwd: string,
  timeoutMs: number,
  env?: Record<string, string>,
): Promise<ShellRunResult> {
  const started = Date.now();

  return new Promise((resolvePromise) => {
    const child = spawn(invocation.executable, invocation.args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ShellRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      const out = truncate(stdout);
      const err = truncate(stderr);
      finish({
        ok: false,
        exitCode: -1,
        stdout: out.text,
        stderr: err.text || `shell timed out after ${timeoutMs}ms`,
        truncated: out.truncated || err.truncated,
        shell: invocation.shell,
        cwd,
        commandLine: invocation.commandLine,
        durationMs: Date.now() - started,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: error.message,
        truncated: false,
        shell: invocation.shell,
        cwd,
        commandLine: invocation.commandLine,
        durationMs: Date.now() - started,
      });
    });

    child.on("close", (code) => {
      const out = truncate(stdout);
      const err = truncate(stderr);
      const exitCode = code ?? 1;
      finish({
        ok: exitCode === 0,
        exitCode,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
        shell: invocation.shell,
        cwd,
        commandLine: invocation.commandLine,
        durationMs: Date.now() - started,
      });
    });
  });
}

async function materializeInlineScript(
  script: string,
  shell: Exclude<ShellKind, "auto">,
): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "agent-shell-"));
  const ext =
    shell === "powershell" ? ".ps1"
    : shell === "cmd" ? ".cmd"
      : ".sh";
  const path = join(dir, `inline${ext}`);
  const content =
    shell === "bash" && !script.startsWith("#!")
      ? `#!/usr/bin/env bash\nset -euo pipefail\n${script}`
      : script;
  await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
  return { dir, path };
}

export async function runShellRequest(request: ShellRunRequest): Promise<ShellRunResult> {
  const policy = evaluateShellPolicy(request);
  if (!policy.allowed) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: policy.reason ?? "shell command blocked by policy",
      truncated: false,
      shell: resolveEffectiveShell(request.shell),
      cwd: resolveShellCwd(request.cwd),
      commandLine: "",
      durationMs: 0,
      blocked: true,
      blockReason: policy.reason,
    };
  }

  const shell = resolveEffectiveShell(request.shell);
  const cwd = resolveShellCwd(request.cwd);
  const timeoutMs = normalizeTimeout(request.timeoutMs);

  if (request.command?.trim()) {
    const invocation = buildShellInvocation(shell, request.command.trim());
    return runProcess(invocation, cwd, timeoutMs, request.env);
  }

  if (request.script?.trim()) {
    const materialized = await materializeInlineScript(request.script, shell);
    try {
      const invocation = buildScriptFileInvocation(shell, materialized.path, request.args);
      return await runProcess(invocation, cwd, timeoutMs, request.env);
    } finally {
      await rm(materialized.dir, { recursive: true, force: true });
    }
  }

  if (request.scriptPath?.trim()) {
    const resolved = resolveWorkspacePath(request.scriptPath.trim());
    if (!resolved.ok) {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: resolved.error,
        truncated: false,
        shell,
        cwd,
        commandLine: "",
        durationMs: 0,
      };
    }
    if (!existsSync(resolved.absolute)) {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: `script not found: ${resolved.relative}`,
        truncated: false,
        shell,
        cwd,
        commandLine: "",
        durationMs: 0,
      };
    }
    const invocation = buildScriptFileInvocation(
      shell,
      resolved.absolute,
      request.args ?? [],
    );
    return runProcess(invocation, cwd, timeoutMs, request.env);
  }

  return {
    ok: false,
    exitCode: 1,
    stdout: "",
    stderr: "One of command, script, or scriptPath is required",
    truncated: false,
    shell,
    cwd,
    commandLine: "",
    durationMs: 0,
  };
}

export function shellPolicyRequiresApproval(request: ShellRunRequest): boolean {
  return evaluateShellPolicy(request).requiresApproval;
}
