import type { ShellRunRequest } from "@/lib/shell-types";

function splitTrailingArgs(remainder: string | undefined): string[] | undefined {
  const text = remainder?.trim();
  if (!text) return undefined;
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    args.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return args.length > 0 ? args : undefined;
}

type ScriptPathRewrite = {
  scriptPath: string;
  args?: string[];
};

/** Prefer -File over nested pwsh in -Command for reliable script execution. */
export function tryRewriteCommandToScriptPath(
  command: string,
): ScriptPathRewrite | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const pwshFile = trimmed.match(
    /^(?:pwsh|powershell(?:\.exe)?)(?:\s+(?:-NoProfile|-NonInteractive|-ExecutionPolicy\s+\S+))*\s+-File\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+(.*))?$/i,
  );
  if (pwshFile) {
    const scriptPath = (pwshFile[1] ?? pwshFile[2] ?? pwshFile[3] ?? "").trim();
    if (!scriptPath) return null;
    return {
      scriptPath: scriptPath.replace(/\\/g, "/"),
      args: splitTrailingArgs(pwshFile[4]),
    };
  }

  const relativeScript = trimmed.match(
    /^\.[\\/]([^\s"']+\.ps1)(?:\s+(.*))?$/i,
  );
  if (relativeScript) {
    const rel = relativeScript[1]!.replace(/\\/g, "/");
    return {
      scriptPath: rel.startsWith("./") ? rel : `./${rel}`,
      args: splitTrailingArgs(relativeScript[2]),
    };
  }

  return null;
}

export function normalizeShellRunRequest(request: ShellRunRequest): ShellRunRequest {
  if (!request.command?.trim() || request.script?.trim() || request.scriptPath?.trim()) {
    return request;
  }

  const rewritten = tryRewriteCommandToScriptPath(request.command);
  if (!rewritten) return request;

  return {
    ...request,
    mode: "scriptPath",
    command: undefined,
    scriptPath: rewritten.scriptPath,
    args: rewritten.args ?? request.args,
  };
}
