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
];

const APPROVAL_PATTERNS: RegExp[] = [
  /\b(remove-item|rm|del|erase|rmdir|rd)\b/i,
  /\b(git\s+(push|reset|clean|checkout\s+-f|rebase))\b/i,
  /\b(npm\s+(publish|unpublish|deprecate))\b/i,
  /\b(docker\s+(rm|rmi|system\s+prune))\b/i,
  /\b(kill|stop-process|taskkill)\b/i,
  /\b(move-item|mv|ren|rename-item)\b/i,
  /\b(copy-item|cp|xcopy|robocopy)\b/i,
  /\b(set-content|out-file|>|>>)\b/i,
];

function collectInspectText(request: ShellRunRequest): string {
  const parts = [
    request.command,
    request.script,
    request.scriptPath,
    ...(request.args ?? []),
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.join("\n");
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

  for (const pattern of APPROVAL_PATTERNS) {
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
