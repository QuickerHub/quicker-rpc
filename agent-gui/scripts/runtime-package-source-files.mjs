import { cpSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { createWindowsPackageMetadataInspector } from "./runtime-package-metadata.mjs";

const key = (path) => process.platform === "win32" ? path.toLowerCase() : path;
const excluded = (name) => key(name) === "node_modules";
const fingerprint = (stat) => [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].map(String).join(":");
const kind = (stat) => stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "special";

function local(path) {
  if (/(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(path)
    || process.platform === "win32" && /^[/\\]{2}/.test(path)) throw new Error(`Unsafe package source path: ${path}`);
}

function within(root, path) {
  const suffix = relative(root, path);
  if (suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw new Error(`Package source escapes its root: ${path}`);
  if (suffix.split(sep).some(excluded)) throw new Error(`Package source link enters excluded node_modules: ${path}`);
  local(path);
  return path;
}

/** Synchronous source proofs; only copyPackage is allowed to copy package contents. */
export function createPackageSourceInspector({ inspectMetadata = createWindowsPackageMetadataInspector() } = {}) {
  const candidates = new Map();
  const packages = new Map();
  function metadata(paths, options) {
    for (const path of paths) local(path);
    const result = inspectMetadata(paths, options);
    if (result && typeof result.then === "function") throw new Error("Package source metadata inspection must be synchronous");
  }
  function inspectCandidate(rawExistingPackageCandidate) {
    const raw = resolve(rawExistingPackageCandidate);
    const cached = candidates.get(key(raw));
    if (cached) {
      let current = true;
      // Check parents before descendants. A changed link must invalidate the
      // cache before any old descendant path could cross its new target.
      for (const proof of cached.trace) {
        try {
          const stat = lstatSync(proof.path, { bigint: true });
          if (kind(stat) !== proof.type || fingerprint(stat) !== proof.fingerprint
            || proof.type === "link" && readlinkSync(proof.path) !== proof.link) { current = false; break; }
        } catch { current = false; break; }
      }
      if (current) return cached.canonical;
      candidates.delete(key(raw));
    }
    // Missing lookups must not retain metadata checks: a later candidate or
    // ancestor may have appeared with unsafe attributes in the meantime.
    const checkedMetadata = new Set();
    function exactMetadata(path) {
      if (checkedMetadata.has(key(path))) return;
      metadata([path]);
      checkedMetadata.add(key(path));
    }
    const below = (parent, child) => {
      const suffix = relative(parent, child);
      return suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
    };
    let pending = raw;
    let requiredLinkTarget;
    const links = new Set();
    const trace = [];
    const record = (path) => {
      const stat = lstatSync(path, { bigint: true });
      const proof = { path, type: kind(stat), fingerprint: fingerprint(stat) };
      if (stat.isSymbolicLink()) proof.link = readlinkSync(path);
      trace.push(proof);
      return { stat, proof };
    };
    while (true) {
      exactMetadata(pending);
      const anchor = parse(pending).root;
      const parts = relative(anchor, pending).split(sep).filter(Boolean);
      let cursor = anchor;
      record(anchor);
      let redirected = false;
      for (const part of parts) {
        cursor = join(cursor, part);
        let entry;
        try { entry = record(cursor); }
        catch (error) {
          if ((error.code === "ENOENT" || error.code === "ENOTDIR")
            && (!requiredLinkTarget || !below(cursor, requiredLinkTarget))) return undefined;
          throw error;
        }
        if (!entry.stat.isSymbolicLink()) continue;
        if (links.has(key(cursor))) throw new Error(`Package candidate link cycle: ${cursor}`);
        links.add(key(cursor));
        const target = resolve(dirname(cursor), entry.proof.link);
        exactMetadata(target);
        // The target of an existing link must itself exist; only a missing
        // suffix after that target is an ordinary unsuccessful package lookup.
        requiredLinkTarget = requiredLinkTarget && below(cursor, requiredLinkTarget)
          ? resolve(target, relative(cursor, requiredLinkTarget)) : target;
        pending = resolve(target, relative(cursor, pending));
        redirected = true;
        break;
      }
      if (redirected) continue;
      const canonical = realpathSync(pending);
      exactMetadata(canonical);
      if (!statSync(canonical).isDirectory()) throw new Error(`Package candidate is not a directory: ${raw}`);
      record(canonical);
      candidates.set(key(raw), { canonical, trace });
      return canonical;
    }
  }

  function capture(root, path, expected) {
    within(root, resolve(path));
    const trace = [];
    const links = new Set();
    function record(file) {
      const stat = lstatSync(file, { bigint: true });
      const entry = { path: file, type: kind(stat), fingerprint: fingerprint(stat) };
      if (stat.isSymbolicLink()) entry.link = readlinkSync(file);
      const previous = expected?.trace[trace.length];
      if (expected && (!previous || JSON.stringify(entry) !== JSON.stringify(previous)))
        throw Object.assign(new Error(`Package source changed after inspection: ${file}`), { expected: previous, actual: entry });
      trace.push(entry);
      return entry;
    }
    const rootEntry = record(root);
    if (rootEntry.type !== "directory") throw new Error(`Package source root is not a physical directory: ${root}`);
    let cursor = root;
    let parts = relative(root, resolve(path)).split(sep).filter(Boolean);
    let entry = rootEntry;
    while (parts.length) {
      cursor = join(cursor, parts.shift());
      entry = record(cursor);
      if (entry.type !== "link") continue;
      if (links.has(key(cursor))) throw new Error(`Package source link cycle: ${cursor}`);
      links.add(key(cursor));
      const target = within(root, resolve(dirname(cursor), entry.link));
      parts = [...relative(root, target).split(sep).filter(Boolean), ...parts];
      cursor = root;
      entry = rootEntry;
    }
    const canonical = within(root, realpathSync(cursor));
    const actual = statSync(canonical, { bigint: true });
    const type = kind(actual);
    if (type !== "file" && type !== "directory") throw new Error(`Unsupported package source entry: ${path}`);
    const result = { type, realpath: canonical, fingerprint: fingerprint(actual), trace };
    if (expected && JSON.stringify(result) !== JSON.stringify(expected)) throw new Error(`Package source changed after inspection: ${path}`);
    return result;
  }

  function assertOwned(root, path) {
    const canonicalRoot = resolve(root);
    const prepared = packages.get(key(canonicalRoot));
    const proof = prepared?.entries.get(key(resolve(path)));
    if (prepared && !proof) throw new Error(`Package source was not inspected: ${path}`);
    return capture(canonicalRoot, resolve(path), proof).realpath;
  }

  function readManifest(root) {
    const canonical = resolve(root);
    if (!packages.has(key(canonical))) throw new Error(`Package source was not inspected: ${root}`);
    const path = assertOwned(canonical, join(canonical, "package.json"));
    if (!statSync(path).isFile()) throw new Error(`Package manifest is not a regular file: ${path}`);
    return JSON.parse(readFileSync(path, "utf8"));
  }

  function inspectPackage(canonicalRoot, requestedName) {
    const root = resolve(canonicalRoot);
    if (!packages.has(key(root))) {
      metadata([root], { treeRoot: root });
      const entries = new Map();
      function visit(path, active) {
        const proof = capture(root, path);
        entries.set(key(path), proof);
        if (proof.type !== "directory") return;
        const identity = key(proof.realpath);
        if (active.has(identity)) throw new Error(`Package source directory cycle: ${path}`);
        const next = new Set(active).add(identity);
        for (const name of readdirSync(path)) {
          if (excluded(name)) continue;
          visit(join(path, name), next);
        }
      }
      visit(root, new Set());
      packages.set(key(root), { entries });
    }
    try {
      const manifest = readManifest(root);
      if (typeof manifest.main === "string" && manifest.main && (!Object.hasOwn(manifest, "exports") || isBuiltin(requestedName))) {
        within(root, resolve(root, manifest.main));
      }
      return manifest;
    } catch (error) {
      packages.delete(key(root));
      throw error;
    }
  }

  function copyPackage(root, target) {
    const canonical = resolve(root);
    if (!packages.has(key(canonical))) throw new Error(`Package source was not inspected: ${root}`);
    cpSync(canonical, target, { recursive: true, dereference: true, filter: (path) => {
      if (path !== canonical && excluded(basename(path))) return false;
      assertOwned(canonical, path);
      return true;
    } });
  }
  return { inspectCandidate, inspectPackage, readManifest, copyPackage, assertOwned, dispose: () => inspectMetadata.dispose?.() };
}
