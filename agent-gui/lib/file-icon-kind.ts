/** File icon kinds for explorer tree (aligned with VS Code / Material Icon Theme). */

export type FileIconKind =
  | "json"
  | "jsonc"
  | "csharp"
  | "javascript"
  | "typescript"
  | "tsx"
  | "jsx"
  | "python"
  | "markdown"
  | "html"
  | "css"
  | "scss"
  | "less"
  | "xml"
  | "svg"
  | "yaml"
  | "shell"
  | "powershell"
  | "rust"
  | "go"
  | "java"
  | "kotlin"
  | "ruby"
  | "php"
  | "sql"
  | "docker"
  | "toml"
  | "ini"
  | "env"
  | "config"
  | "git"
  | "proto"
  | "text"
  | "generic";

const EXT_MAP: Record<string, FileIconKind> = {
  json: "json",
  jsonc: "jsonc",
  cs: "csharp",
  csx: "csharp",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  py: "python",
  pyw: "python",
  md: "markdown",
  mdx: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  xml: "xml",
  xaml: "xml",
  svg: "svg",
  yaml: "yaml",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  php: "php",
  sql: "sql",
  sqlite: "sql",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  env: "env",
  proto: "proto",
  gitignore: "git",
  gitattributes: "git",
  dockerfile: "docker",
  csproj: "xml",
  props: "xml",
  sln: "xml",
  txt: "text",
  log: "text",
};

const BASENAME_MAP: Record<string, FileIconKind> = {
  dockerfile: "docker",
  makefile: "shell",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".env": "env",
  ".env.local": "env",
  ".env.example": "env",
};

export function resolveFileIconKind(fileName: string): FileIconKind {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const lower = base.toLowerCase();

  const byName = BASENAME_MAP[lower];
  if (byName) return byName;

  if (lower.endsWith(".eval.cs")) return "csharp";

  const dot = base.lastIndexOf(".");
  if (dot < 0) return "generic";

  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? "generic";
}

/** Maps icon kind to `guessFileLanguage` / snapshot badge language id. */
export function fileIconKindToLanguage(kind: FileIconKind): string | undefined {
  const map: Partial<Record<FileIconKind, string>> = {
    json: "json",
    jsonc: "json",
    csharp: "csharp",
    javascript: "javascript",
    typescript: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    python: "python",
    markdown: "markdown",
    html: "html",
    css: "css",
    scss: "css",
    less: "css",
    xml: "xml",
    svg: "xml",
    yaml: "yaml",
    shell: "shell",
    powershell: "powershell",
    rust: "rust",
    go: "go",
    java: "java",
    kotlin: "kotlin",
    ruby: "ruby",
    php: "php",
    sql: "sql",
    toml: "toml",
    ini: "ini",
    env: "dotenv",
    config: "ini",
    docker: "dockerfile",
    proto: "protobuf",
    text: "text",
  };
  return map[kind];
}

export function fileIconKindToBadgeLabel(kind: FileIconKind): string {
  const labels: Record<FileIconKind, string> = {
    json: "JSON",
    jsonc: "JSON",
    csharp: "C#",
    javascript: "JS",
    typescript: "TS",
    tsx: "TSX",
    jsx: "JSX",
    python: "PY",
    markdown: "MD",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "LESS",
    xml: "XML",
    svg: "SVG",
    yaml: "YAML",
    shell: "SH",
    powershell: "PS",
    rust: "RS",
    go: "GO",
    java: "JV",
    kotlin: "KT",
    ruby: "RB",
    php: "PHP",
    sql: "SQL",
    docker: "DK",
    toml: "TOML",
    ini: "INI",
    env: "ENV",
    config: "CFG",
    git: "GIT",
    proto: "PB",
    text: "TXT",
    generic: "TXT",
  };
  return labels[kind];
}
