export type TerminalOutputLanguage = "json" | "text" | "log";

export type TerminalOutputDisplay = {
  language: TerminalOutputLanguage;
  virtualPath: string;
  badge: string;
  content: string;
};

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function formatTerminalOutputContent(
  text: string,
  language: TerminalOutputLanguage,
): string {
  if (!text) return "";
  if (language !== "json") return text;
  const parsed = tryParseJson(text);
  if (parsed == null) return text;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function guessTerminalOutputDisplay(
  output: string,
  commandLine?: string,
): TerminalOutputDisplay {
  const cmd = commandLine?.toLowerCase() ?? "";
  const parsed = tryParseJson(output);
  if (parsed != null || cmd.includes("convertto-json") || cmd.includes("| jq")) {
    return {
      language: "json",
      virtualPath: "terminal/output.json",
      badge: "JSON",
      content: formatTerminalOutputContent(output, "json"),
    };
  }

  const looksLikeLog =
    /^(info|warn|error|debug|trace)\b/i.test(output.trim())
    || /\b(ERROR|WARN|INFO)\b/.test(output);

  if (looksLikeLog) {
    return {
      language: "log",
      virtualPath: "terminal/output.log",
      badge: "LOG",
      content: output,
    };
  }

  return {
    language: "text",
    virtualPath: "terminal/output.txt",
    badge: "OUT",
    content: output,
  };
}
