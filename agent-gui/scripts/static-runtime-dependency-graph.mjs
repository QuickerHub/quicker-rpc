import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { isAbsolute, join, relative, sep } from "node:path";

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function invalid(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code: "ERR_RUNTIME_PACKAGE_INVALID" });
}

function packageName(name) {
  if (typeof name !== "string" || !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name))
    throw invalid(`Invalid runtime package name: ${String(name)}`);
  return name;
}

function canonical(path, assertPath) {
  const result = realpathSync(path);
  assertPath(result);
  return result;
}

function readManifest(directory, assertPath) {
  let path;
  try { path = canonical(join(directory, "package.json"), assertPath); }
  catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw invalid(`Runtime package has no package.json: ${directory}`, error);
    throw error;
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw invalid(`Invalid runtime package.json: ${path}`, error); }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || own(manifest, "name") && typeof manifest.name !== "string"
    || own(manifest, "version") && typeof manifest.version !== "string")
    throw invalid(`Invalid runtime package metadata: ${path}`);
  return manifest;
}

function hasDeclaredBareEntry(manifest) {
  if (own(manifest, "exports")) {
    const value = manifest.exports;
    if (value === null) return false;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.keys(value).some((key) => key.startsWith("."))) return own(value, ".") && value["."] !== null;
      return Object.keys(value).length > 0;
    }
    return true;
  }
  return own(manifest, "main") && manifest.main !== null && manifest.main !== "";
}

function assertDeclaredEntry(name, directory, manifest, resolver, assertPath) {
  if (!own(manifest, "exports") && !hasDeclaredBareEntry(manifest)) return;
  let entry;
  try {
    entry = resolver.resolve(name);
    // Node's bare builtin result is not the physical npm polyfill package.
    if (isBuiltin(entry)) entry = resolver.resolve(directory);
  } catch (error) {
    // Import-only and subpath-only exports have no require entry. Actual ESM
    // resolution is checked separately from importRequests, without evaluation.
    if (error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") return;
    throw invalid(`Cannot resolve declared runtime entry for ${name}: ${directory}`, error);
  }
  entry = canonical(entry, assertPath);
  if (!statSync(entry).isFile()) throw invalid(`Runtime entry is not a regular file: ${entry}`);
}

/** Resolve package metadata and entry paths only; never evaluate package code. */
export function findRuntimePackage(name, from, assertPath = () => {}, {
  inspectCandidate = () => {}, inspectPackage = () => {},
} = {}) {
  packageName(name);
  const context = canonical(from, assertPath);
  const resolver = createRequire(join(context, "package.json"));
  // Bare builtin names have no lookup paths, but npm may depend on a real
  // polyfill package with the same name (for example buffer or events).
  for (const base of resolver.resolve.paths(`${name}/package.json`) ?? []) {
    const candidate = join(base, name);
    inspectCandidate(candidate);
    try { lstatSync(candidate); }
    catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
      throw error;
    }
    const directory = canonical(candidate, assertPath);
    if (!statSync(directory).isDirectory()) throw invalid(`Runtime package is not a directory: ${directory}`);
    inspectPackage(directory, name);
    const manifest = readManifest(directory, assertPath);
    assertDeclaredEntry(name, directory, manifest, resolver, assertPath);
    return directory;
  }
  throw Object.assign(new Error(`Missing runtime package ${name} from ${context}`), {
    code: "ERR_RUNTIME_PACKAGE_MISSING", packageName: name,
  });
}

export function isRuntimePackageMissing(error) {
  return error?.code === "ERR_RUNTIME_PACKAGE_MISSING";
}

function dependencyMap(manifest, field) {
  const value = manifest[field] ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.entries(value).some(([name, version]) => { packageName(name); return typeof version !== "string"; }))
    throw invalid(`Invalid runtime ${field} in ${manifest.name ?? "package"}`);
  return value;
}

/** The effective runtime edges, shared by staging and closure verification. */
export function runtimeDependencyEntries(manifest) {
  const required = dependencyMap(manifest, "dependencies");
  const optionalDependencies = dependencyMap(manifest, "optionalDependencies");
  const peers = dependencyMap(manifest, "peerDependencies");
  const entries = [];
  for (const name of Object.keys(required).sort())
    if (!own(optionalDependencies, name)) entries.push({ name, kind: "dependency", optional: false });
  for (const name of Object.keys(optionalDependencies).sort()) entries.push({ name, kind: "optional", optional: true });
  for (const name of Object.keys(peers).sort()) {
    if (own(required, name) || own(optionalDependencies, name)) continue;
    const optional = manifest.peerDependenciesMeta?.[name]?.optional === true;
    entries.push({ name, kind: optional ? "optionalPeer" : "peer", optional });
  }
  return entries;
}

/** Verify the staged production graph without importing providers or runtime code. */
export function verifyRuntimeDependencyGraph(root, runtimePackageRoots, additionalRoots = []) {
  const directory = realpathSync(root);
  if (!statSync(directory).isDirectory()) throw invalid("Runtime root is not a directory");
  if (!Array.isArray(runtimePackageRoots) || runtimePackageRoots.length === 0)
    throw invalid("Runtime package roots must be a non-empty generated manifest list");
  if (!Array.isArray(additionalRoots)) throw invalid("Runtime entrypoint roots must be a list");
  const assertPath = (path) => {
    const suffix = relative(directory, path);
    if (suffix === ".." || suffix.startsWith(".." + sep) || isAbsolute(suffix))
      throw invalid(`Runtime dependency escapes its artifact: ${path}`);
  };
  const packages = new Map(), edges = [], importRequests = [];
  function visit(name, from, kind, optional = false) {
    let target;
    try { target = findRuntimePackage(name, from, assertPath); }
    catch (error) {
      if (optional && isRuntimePackageMissing(error)) return;
      throw error;
    }
    edges.push({ name, kind, from, to: target });
    const manifest = readManifest(target, assertPath);
    if (hasDeclaredBareEntry(manifest)) importRequests.push({ specifier: name, from, allowNoExport: true });
    if (packages.has(target)) return;
    packages.set(target, { name: manifest.name ?? name, version: manifest.version ?? "", directory: target });
    for (const { name, kind, optional } of runtimeDependencyEntries(manifest)) visit(name, target, kind, optional);
  }
  for (const name of [...new Set(runtimePackageRoots)].sort()) visit(name, directory, "root");
  for (const entry of additionalRoots) {
    if (!entry || typeof entry !== "object" || typeof entry.from !== "string")
      throw invalid("Runtime entrypoint root must declare a package name and directory");
    const from = canonical(entry.from, assertPath);
    if (!statSync(from).isDirectory()) throw invalid(`Runtime entrypoint parent is not a directory: ${from}`);
    visit(entry.name, from, "entrypoint");
  }
  return { packageCount: packages.size, packages: [...packages.values()].sort((a, b) => a.directory.localeCompare(b.directory)), edges, importRequests };
}
