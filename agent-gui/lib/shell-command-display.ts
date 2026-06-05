export type ShellCommandHighlightLanguage =
  | "powershell"
  | "shell"
  | "terminal";

export type ShellCommandDisplayParts = {
  prompt: "$";
  invocationPrefix: string;
  scriptText: string;
  highlightLanguage: ShellCommandHighlightLanguage;
};

const PWSH_COMMAND_RE =
  /^(pwsh|powershell(?:\.exe)?)((?:\s+(?:-NoProfile|-NonInteractive|-ExecutionPolicy\s+\S+))*)\s+-Command\s+/i;

const PWSH_FILE_RE =
  /^(pwsh|powershell(?:\.exe)?)((?:\s+(?:-NoProfile|-NonInteractive|-ExecutionPolicy\s+\S+))*)\s+-File\s+\S+\s*/i;

const CMD_RE = /^cmd(?:\.exe)?\s+\/c\s+/i;
const BASH_LC_RE = /^bash\s+-lc\s+/i;
const BASH_RE = /^bash\s+/i;

function resolveFallbackLanguage(shell?: string): ShellCommandHighlightLanguage {
  const shellKind = shell?.trim().toLowerCase();
  if (shellKind === "powershell") return "powershell";
  if (shellKind === "bash" || shellKind === "cmd") return "shell";
  return "terminal";
}

/** Split invocation wrapper from script body for terminal command highlighting. */
export function resolveShellCommandDisplay(
  commandLine: string,
  shell?: string,
): ShellCommandDisplayParts {
  const line = commandLine.trim();
  if (!line) {
    return {
      prompt: "$",
      invocationPrefix: "",
      scriptText: "",
      highlightLanguage: "terminal",
    };
  }

  const pwshCommand = line.match(PWSH_COMMAND_RE);
  if (pwshCommand) {
    const prefix = pwshCommand[0];
    return {
      prompt: "$",
      invocationPrefix: prefix,
      scriptText: line.slice(prefix.length),
      highlightLanguage: "powershell",
    };
  }

  const pwshFile = line.match(PWSH_FILE_RE);
  if (pwshFile) {
    const prefix = pwshFile[0];
    return {
      prompt: "$",
      invocationPrefix: prefix,
      scriptText: line.slice(prefix.length),
      highlightLanguage: "powershell",
    };
  }

  const cmd = line.match(CMD_RE);
  if (cmd) {
    return {
      prompt: "$",
      invocationPrefix: cmd[0],
      scriptText: line.slice(cmd[0].length),
      highlightLanguage: "shell",
    };
  }

  const bashLc = line.match(BASH_LC_RE);
  if (bashLc) {
    return {
      prompt: "$",
      invocationPrefix: bashLc[0],
      scriptText: line.slice(bashLc[0].length),
      highlightLanguage: "shell",
    };
  }

  const bash = line.match(BASH_RE);
  if (bash) {
    return {
      prompt: "$",
      invocationPrefix: bash[0],
      scriptText: line.slice(bash[0].length),
      highlightLanguage: "shell",
    };
  }

  const highlightLanguage = resolveFallbackLanguage(shell);
  return {
    prompt: "$",
    invocationPrefix: "",
    scriptText: line,
    highlightLanguage,
  };
}

export function shouldUseStructuredShellCommand(
  parts: ShellCommandDisplayParts,
): boolean {
  return parts.highlightLanguage !== "terminal" && Boolean(parts.scriptText);
}
