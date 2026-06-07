import type { ShellExecMode, ShellRunRequest } from "@/lib/shell-types";

export type ShellPolicyVerdict = {
  allowed: boolean;
  reason?: string;
  risk: "low" | "medium" | "high";
  requiresApproval: boolean;
};

const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\bformat\s+[a-z]:/i,
    reason: "disk format commands are blocked",
  },
  {
    pattern: /\bdiskpart\b/i,
    reason: "diskpart is blocked",
  },
  {
    pattern: /\b(shutdown|restart-computer)\b/i,
    reason: "system shutdown/reboot commands are blocked",
  },
  {
    pattern: /(^|[;&|]\s*)rm\s+-rf\s+\/(?:\s|$|[;&|])/i,
    reason: "recursive delete of filesystem root is blocked",
  },
  {
    pattern: /\b(remove-item|ri)\b[^\n\r|;&]*-recurse[^\n\r|;&]*\s+[a-z]:\\(?:windows|program files)\b/i,
    reason: "recursive delete under protected Windows directories is blocked",
  },
  {
    pattern: /\|\s*(i?ex|invoke-expression)\b/i,
    reason: "piped invoke-expression (curl|iex) is blocked",
  },
  {
    pattern: /\bcurl\b[^\n\r|;&]*\|\s*(bash|sh|pwsh|powershell)\b/i,
    reason: "curl piped to shell is blocked",
  },
  {
    pattern: /\bqkrpc(\.exe)?\s+wait\b/i,
    reason: "use qkrpc_wait tool instead of shell wait",
  },
  {
    pattern: /\bqkrpc(\.exe)?\s+ping\b/i,
    reason: "do not probe plugin via shell ping; use qkrpc tools or header RPC status",
  },
  {
    pattern: /\bqkrpc(\.exe)?\s+serve\b/i,
    reason: "do not start qkrpc serve via shell_exec",
  },
  {
    pattern: /\binvoke-restmethod\b[^\n\r|;&]*(?:9477|qkrpc)/i,
    reason: "do not probe qkrpc serve via shell; check header RPC status",
  },
  {
    pattern: /\bcurl\b[^\n\r|;&]*(?:9477|\/health)/i,
    reason: "do not probe qkrpc serve via shell",
  },
  {
    pattern: /\bnetstat\b[^\n\r|;&]*9477/i,
    reason: "do not probe qkrpc serve port via shell",
  },
  {
    pattern: /\bget-process\b[^\n\r|;&]*quicker/i,
    reason: "do not diagnose Quicker connectivity via shell",
  },
  {
    pattern: /\bbuild\.ps1\b[^\n\r|;&]*(?:\s|^)-t\b/i,
    reason: "hot-update is not a shell_exec recovery step; ask user to reload plugin",
  },
];

/** Delete / irreversible remote or repo mutations. */
const DELETE_PATTERNS: RegExp[] = [
  /\b(remove-item|rm|del|erase|rmdir|rd)\b/i,
  /\b(git\s+(push|clean|reset))\b/i,
  /\b(git\s+checkout\s+(-f|--force))\b/i,
  /\b(git\s+rebase)\b/i,
  /\b(npm\s+(publish|unpublish|deprecate))\b/i,
  /\b(docker\s+(rm|rmi|system\s+prune))\b/i,
];

/** Local writes (files, moves, commits) — not plain read/query. */
const WRITE_PATTERNS: RegExp[] = [
  /\b(set-content|out-file|add-content)\b/i,
  /\b(move-item|rename-item)\b/i,
  /\b(new-item|mkdir|md)\b/i,
  /\b(git\s+(commit|merge|pull))\b/i,
];

/**
 * Single-line commands that are typically read-only.
 * Matched only when no delete/write token appears on the same line.
 */
const READ_ONLY_SINGLE_LINE_PATTERNS: RegExp[] = [
  /^git\s+(status|log|diff|show|branch|rev-parse|describe|fetch|remote|config\s+--get)\b/i,
  /^git\s+--version\b/i,
  /^(get-content|get-childitem|get-location|dir|ls|cat|type|select-string|findstr|where-object|measure-object|format-table|format-list)\b/i,
  /^invoke-restmethod\b/i,
  /^qkrpc\b/i,
  /^dotnet\s+(build|test|restore|run|tool)\b/i,
  /^npm\s+(run|test|ci|install|view|list|prefix|exec)\b/i,
  /^pnpm\s+(run|test|install|exec|dev)\b/i,
  /^pwsh(\.exe)?\b/i,
  /^powershell(\.exe)?\b/i,
  /^node(\.exe)?\b/i,
  /^cargo\s+(build|test|check|run)\b/i,
  /^uv\s+(run|sync|pip)\b/i,
  /^(rustc?|go|gh)\b/i,
  /^(write-output|echo)\b/i,
];

const APPROVAL_PATTERNS: RegExp[] = [...DELETE_PATTERNS, ...WRITE_PATTERNS];

function collectInspectText(request: ShellRunRequest): string {
  const parts = [
    request.command,
    request.script,
    request.scriptPath,
    ...(request.args ?? []),
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.join("\n");
}

function isSingleLineReadOnly(text: string): boolean {
  const line = text.trim();
  if (!line || line.includes("\n")) {
    return false;
  }
  if (APPROVAL_PATTERNS.some((pattern) => pattern.test(line))) {
    return false;
  }
  return READ_ONLY_SINGLE_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

export function evaluateShellPolicy(request: ShellRunRequest): ShellPolicyVerdict {
  const text = collectInspectText(request);
  if (!text.trim()) {
    return {
      allowed: false,
      reason: "empty shell request",
      risk: "low",
      requiresApproval: false,
    };
  }

  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.pattern.test(text)) {
      return {
        allowed: false,
        reason: blocked.reason,
        risk: "high",
        requiresApproval: false,
      };
    }
  }

  if (isSingleLineReadOnly(text)) {
    return {
      allowed: true,
      risk: "low",
      requiresApproval: false,
    };
  }

  for (const pattern of DELETE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: true,
        risk: "high",
        requiresApproval: true,
      };
    }
  }

  for (const pattern of WRITE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: true,
        risk: "medium",
        requiresApproval: true,
      };
    }
  }

  return {
    allowed: true,
    risk: "low",
    requiresApproval: false,
  };
}

export function summarizeShellRequest(request: ShellRunRequest): string {
  if (request.command?.trim()) {
    const oneLine = request.command.trim().replace(/\s+/g, " ");
    return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
  }
  if (request.scriptPath?.trim()) {
    return request.scriptPath.trim();
  }
  if (request.script?.trim()) {
    const first = request.script.trim().split(/\r?\n/)[0] ?? "inline script";
    return first.length > 120 ? `${first.slice(0, 117)}…` : first;
  }
  return "shell command";
}

export function shellModeLabel(mode: ShellExecMode): string {
  switch (mode) {
    case "command":
      return "command";
    case "script":
      return "inline script";
    case "scriptPath":
      return "script file";
    default:
      return mode;
  }
}

/** Full shell body for approval UI (command, inline script, or script path + args). */
export function formatShellApprovalCommand(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (typeof record.command === "string" && record.command.trim()) {
    return record.command;
  }
  if (typeof record.script === "string" && record.script.trim()) {
    return record.script;
  }
  if (typeof record.scriptPath === "string" && record.scriptPath.trim()) {
    const path = record.scriptPath.trim();
    const args = Array.isArray(record.args)
      ? record.args.filter((arg): arg is string => typeof arg === "string" && arg.length > 0)
      : [];
    return args.length > 0 ? `${path} ${args.join(" ")}` : path;
  }
  return null;
}
