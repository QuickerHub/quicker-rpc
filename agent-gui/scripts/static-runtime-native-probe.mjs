export const STATIC_RUNTIME_NATIVE_CONTEXTS = Object.freeze({
  "better-sqlite3": "lib",
  "node-pty": "terminal-runtime",
  ws: "browser-runtime",
  playwright: "browser-runtime",
});

/** Imported by a plain Node child; require stays rooted in the generated app's probe context. */
export function probeStaticRuntimeNative(appRoot, require, contexts = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const Module = require("node:module");
  const { createHash } = require("node:crypto");
  const root = fs.realpathSync(appRoot);
  let boundaryError;
  const inside = (file) => {
    const lexical = path.resolve(file);
    const lexicalRelative = path.relative(root, lexical);
    if (lexicalRelative === ".." || lexicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(lexicalRelative)) {
      boundaryError ??= new Error(`Runtime module resolves outside app directory: ${file}`);
      throw boundaryError;
    }
    const canonical = fs.realpathSync(lexical);
    const relative = path.relative(root, canonical);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      boundaryError ??= new Error(`Runtime module resolves outside app directory: ${file} -> ${canonical}`);
      throw boundaryError;
    }
    return canonical;
  };
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (...args) {
    const resolved = originalResolve.apply(this, args);
    if (!Module.isBuiltin(resolved)) inside(resolved);
    return resolved;
  };
  try {
    const modules = [];
    const load = (name) => {
      const from = inside(contexts[name] === undefined ? root : path.resolve(root, contexts[name]));
      if (!fs.statSync(from).isDirectory()) throw new Error(`Runtime module context is not a directory: ${from}`);
      const appRequire = Module.createRequire(path.join(from, "package.json"));
      const resolved = appRequire.resolve(name);
      const value = appRequire(name);
      if (boundaryError) throw boundaryError;
      modules.push({ name, from, path: inside(resolved) });
      return value;
    };
    const Database = load("better-sqlite3");
    const database = new Database(":memory:");
    try {
      database.exec("SELECT 1");
    } finally {
      database.close();
    }
    load("node-pty");
    const ptyRequire = Module.createRequire(modules.find((entry) => entry.name === "node-pty").path);
    const { loadNativeModule } = ptyRequire("./utils");
    // Windows' public wrapper delays native loading until terminal construction.
    // Loading these addons only registers functions; never invoke those functions here.
    for (const name of process.platform === "win32" ? ["conpty", "pty", "conpty_console_list"] : ["pty"]) {
      loadNativeModule(name);
      if (boundaryError) throw boundaryError;
    }
    load("ws");
    load("playwright");
    const nativeAddons = [];
    for (const file of Object.keys(require.cache)) {
      const canonical = inside(file);
      if (!canonical.endsWith(".node")) continue;
      nativeAddons.push({
        path: canonical,
        bytes: fs.statSync(canonical).size,
        sha256: createHash("sha256").update(fs.readFileSync(canonical)).digest("hex"),
      });
    }
    if (boundaryError) throw boundaryError;
    return { ok: true, node: process.version, platform: process.platform, arch: process.arch, modules, nativeAddons };
  } finally {
    Module._resolveFilename = originalResolve;
  }
}

/** Resolve with the target Node's ESM rules without importing any provider code. */
export function probeStaticRuntimeImports(appRoot, requests, require, resolveImport) {
  const fs = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath, pathToFileURL } = require("node:url");
  const { createRequire, isBuiltin } = require("node:module");
  const root = fs.realpathSync(appRoot);
  const inside = (file) => {
    const lexical = path.resolve(file);
    const lexicalRelative = path.relative(root, lexical);
    if (lexicalRelative === ".." || lexicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(lexicalRelative)) {
      throw new Error(`Runtime import resolves outside app directory: ${file}`);
    }
    const canonical = fs.realpathSync(lexical);
    const relative = path.relative(root, canonical);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Runtime import resolves outside app directory: ${file} -> ${canonical}`);
    }
    return canonical;
  };
  const imports = [];
  for (const request of requests) {
    const mode = request.mode ?? "import";
    if (mode !== "import" && mode !== "require") throw new Error(`Unsupported runtime import mode: ${mode}`);
    const from = inside(request.from);
    if (!fs.statSync(from).isDirectory()) throw new Error(`Runtime import parent is not a directory: ${from}`);
    let resolved;
    try {
      const parent = pathToFileURL(path.join(from, "package.json")).href;
      if (mode === "require") {
        const file = createRequire(parent).resolve(request.specifier);
        resolved = isBuiltin(file) ? file : pathToFileURL(file).href;
      } else {
        resolved = resolveImport(request.specifier, parent);
      }
    } catch (error) {
      if (request.allowNoExport && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") continue;
      throw error;
    }
    if (isBuiltin(resolved)) continue;
    const url = new URL(resolved);
    if (url.protocol !== "file:") throw new Error(`Unsupported runtime import URL: ${resolved}`);
    const file = inside(fileURLToPath(url));
    if (!fs.statSync(file).isFile()) throw new Error(`Runtime import is not a regular file: ${file}`);
    imports.push({ specifier: request.specifier, from, path: file });
  }
  return { ok: true, imports };
}
