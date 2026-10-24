import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx"))("esbuild");
// The wire reader is platform-neutral. New runtime dependencies require an explicit review.
const allowedExternalImports = new Set(["@bufbuild/protobuf/wire"]);

function documentEntries(directory = join(root, "lib/action-editor/document")) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Document source cannot use a link: ${path}`);
    if (entry.isDirectory()) return documentEntries(path);
    return /\.[cm]?tsx?$/.test(entry.name) && !/\.(?:test|spec)\.[cm]?tsx?$/.test(entry.name)
      ? [relative(root, path).replaceAll("\\", "/")] : [];
  }).sort();
}

function frameworkDirective(path, contents) {
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest);
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client" || statement.expression.text === "use server") return statement.expression.text;
  }
  return undefined;
}

/** Inspect runtime imports only: compile in memory, without loading or executing the document. */
export async function inspectDesignerDocumentDependencies(options = {}) {
  const entryPoints = options.stdin ? [] : documentEntries();
  if (!options.stdin && entryPoints.length === 0) throw new Error("No Designer document source found");
  const result = await build({
    absWorkingDir: root,
    entryPoints,
    ...(options.stdin ? { stdin: { ...options.stdin, resolveDir: root } } : {}),
    outdir: ".tmp/document-dependency-check",
    bundle: true,
    packages: "external",
    platform: "neutral",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const violations = [];
  const externalImports = new Set();
  for (const [path, input] of Object.entries(result.metafile.inputs)) {
    const code = path === "<stdin>" || /\.[cm]?[jt]s$/.test(path);
    if ((!code && !path.endsWith(".json")) || /\.server\.[cm]?[jt]sx?$/.test(path)) violations.push(`${path}: UI/server/asset module`);
    const contents = path === "<stdin>" ? options.stdin.contents : readFileSync(resolve(root, path), "utf8");
    const directive = code ? frameworkDirective(path, contents) : undefined;
    if (directive) violations.push(`${path}: ${directive} module`);
    for (const dependency of input.imports) {
      if (!dependency.external) continue;
      externalImports.add(dependency.path);
      if (!allowedExternalImports.has(dependency.path)) violations.push(`${path} -> ${dependency.path}`);
    }
  }
  if (violations.length) throw new Error(`Designer document runtime dependency boundary failed:\n${[...new Set(violations)].join("\n")}`);
  return {
    ok: true,
    entryPoints,
    inputCount: Object.keys(result.metafile.inputs).length,
    externalImports: [...externalImports].sort(),
    limitations: [
      "Static runtime import graph only; external package internals and global API use are not audited.",
      "Type-only imports are erased by the compiler. No output is written or executed.",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await inspectDesignerDocumentDependencies(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
