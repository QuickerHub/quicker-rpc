export type HighlightTokenType =
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "property"
  | "selector"
  | "punctuation"
  | "plain";

export type HighlightToken = {
  type: HighlightTokenType;
  text: string;
};

export function resolveHighlightLanguage(
  path: string,
  code: string,
  guessFromPath: (path: string) => string | undefined,
): string | undefined {
  const fromPath = guessFromPath(path);
  if (fromPath && fromPath !== "text") return fromPath;

  const trimmed = code.trim();
  if (!trimmed) return fromPath;

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
    || (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      if (/^[\[{]/.test(trimmed)) return "json";
    }
  }

  return fromPath;
}

export function tokenizeCode(code: string, language?: string): HighlightToken[] {
  switch (language) {
    case "json":
      return tokenizeJson(code);
    case "css":
      return tokenizeCss(code);
    case "csharp":
      return tokenizeCSharp(code);
    case "markdown":
      return tokenizeMarkdown(code);
    default:
      return [{ type: "plain", text: code }];
  }
}

function pushPlain(tokens: HighlightToken[], text: string) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last?.type === "plain") {
    last.text += text;
    return;
  }
  tokens.push({ type: "plain", text });
}

function readJsonString(code: string, start: number): { text: string; next: number } {
  let i = start + 1;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "\"") {
      return { text: code.slice(start, i + 1), next: i + 1 };
    }
    i++;
  }
  return { text: code.slice(start), next: code.length };
}

function peekNextNonSpace(code: string, index: number): string | null {
  let i = index;
  while (i < code.length && /\s/.test(code[i]!)) i++;
  return i < code.length ? code[i]! : null;
}

function tokenizeJson(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;

  while (i < code.length) {
    const ch = code[i]!;

    if (/\s/.test(ch)) {
      const start = i;
      while (i < code.length && /\s/.test(code[i]!)) i++;
      pushPlain(tokens, code.slice(start, i));
      continue;
    }

    if ("{}[]:,".includes(ch)) {
      tokens.push({ type: "punctuation", text: ch });
      i++;
      continue;
    }

    if (ch === "\"") {
      const { text, next } = readJsonString(code, i);
      const isKey = peekNextNonSpace(code, next) === ":";
      tokens.push({ type: isKey ? "property" : "string", text });
      i = next;
      continue;
    }

    if (ch === "-" || /\d/.test(ch)) {
      const start = i;
      if (ch === "-") i++;
      while (i < code.length && /[\d.eE+-]/.test(code[i]!)) i++;
      tokens.push({ type: "number", text: code.slice(start, i) });
      continue;
    }

    if (code.startsWith("true", i) || code.startsWith("false", i) || code.startsWith("null", i)) {
      const word = code.startsWith("false", i)
        ? "false"
        : code.startsWith("true", i)
          ? "true"
          : "null";
      if (!/\w/.test(code[i + word.length] ?? "")) {
        tokens.push({ type: "keyword", text: word });
        i += word.length;
        continue;
      }
    }

    pushPlain(tokens, ch);
    i++;
  }

  return tokens;
}

function tokenizeCss(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const re =
    /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(-?\d+(?:\.\d+)?(?:%|[a-z]+)?)|([.#][\w-]+)|(--[\w-]+)|([{}:;,()])|(\s+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    pushPlain(tokens, code.slice(last, match.index));
    if (match[1] || match[2]) tokens.push({ type: "comment", text: match[1] ?? match[2]! });
    else if (match[3]) tokens.push({ type: "string", text: match[3] });
    else if (match[4]) tokens.push({ type: "number", text: match[4] });
    else if (match[5]) tokens.push({ type: "selector", text: match[5] });
    else if (match[6]) tokens.push({ type: "property", text: match[6] });
    else if (match[7]) tokens.push({ type: "punctuation", text: match[7] });
    else pushPlain(tokens, match[8] ?? "");
    last = match.index + match[0].length;
  }
  pushPlain(tokens, code.slice(last));
  return tokens;
}

const CS_KEYWORDS = new Set([
  "using", "namespace", "class", "public", "private", "protected", "internal",
  "static", "void", "return", "if", "else", "for", "foreach", "while", "switch",
  "case", "break", "continue", "new", "var", "const", "true", "false", "null",
  "async", "await", "try", "catch", "finally", "throw", "this", "base", "override",
  "virtual", "abstract", "sealed", "readonly", "get", "set", "string", "int",
  "bool", "double", "float", "object", "dynamic",
]);

function tokenizeCSharp(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const re =
    /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|(@"[^"]*"|"(?:\\.|[^"\\])*")|(\b[A-Za-z_]\w*\b)|(-?\d+(?:\.\d+)?)|([{}();,.[\]])|(\s+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    pushPlain(tokens, code.slice(last, match.index));
    if (match[1] || match[2]) tokens.push({ type: "comment", text: match[1] ?? match[2]! });
    else if (match[3]) tokens.push({ type: "string", text: match[3] });
    else if (match[4]) {
      const word = match[4];
      tokens.push({
        type: CS_KEYWORDS.has(word) ? "keyword" : "plain",
        text: word,
      });
    } else if (match[5]) tokens.push({ type: "number", text: match[5] });
    else if (match[6]) tokens.push({ type: "punctuation", text: match[6] });
    else pushPlain(tokens, match[7] ?? "");
    last = match.index + match[0].length;
  }
  pushPlain(tokens, code.slice(last));
  return tokens;
}

function tokenizeMarkdown(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i > 0) tokens.push({ type: "plain", text: "\n" });
    if (/^#{1,6}\s/.test(line)) {
      tokens.push({ type: "selector", text: line });
    } else if (/^```/.test(line)) {
      tokens.push({ type: "keyword", text: line });
    } else if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      tokens.push({ type: "property", text: line });
    } else {
      tokens.push({ type: "plain", text: line });
    }
  }
  return tokens;
}
