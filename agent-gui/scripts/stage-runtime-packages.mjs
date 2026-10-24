import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findRuntimePackage, isRuntimePackageMissing, runtimeDependencyEntries } from "./static-runtime-dependency-graph.mjs";
import { createPackageSourceInspector } from "./runtime-package-source-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const key = (path) => process.platform === "win32" ? path.toLowerCase() : path;
const inside = (parent, path) => {
  const suffix = relative(parent, path);
  return !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`);
};
const invalid = (message) => Object.assign(new Error(message), { code: "ERR_RUNTIME_PACKAGE_LAYOUT" });

function assertDestination(directory) {
  if (dirname(directory) === directory || /(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(directory))
    throw invalid(`Unsafe runtime package destination: ${directory}`);
  if (process.platform === "win32") {
    const result = spawnSync("pwsh", ["-NoProfile", "-File", join(root, "scripts/Assert-NsisFixturePaths.ps1"),
      "-PathsJson", JSON.stringify([directory])], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    if (result.error || result.status !== 0) throw invalid(`Unsafe runtime package destination metadata: ${result.error?.message || result.stderr || result.stdout}`);
  }
  for (let cursor = directory; ; cursor = dirname(cursor)) {
    try {
      const entry = lstatSync(cursor);
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw invalid(`Runtime package destination is redirected or not a directory: ${cursor}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (dirname(cursor) === cursor) break;
  }
  for (const name of ["node_modules", ".local", "agent.db", "agent.db.writer.sqlite"]) {
    try { lstatSync(join(directory, name)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw invalid(`Refusing to stage over existing runtime content: ${name}`);
  }
}

/** Copy the resolved production graph, preserving each caller's source identity. */
export function stageRuntimePackages(names, appDirectory, sourceRoot = root, {
  sourceInspector = createPackageSourceInspector(),
} = {}) {
  try { return stageOwnedRuntimePackages(names, appDirectory, sourceRoot, sourceInspector); }
  finally { sourceInspector.dispose?.(); }
}

function stageOwnedRuntimePackages(names, appDirectory, sourceRoot, sourceInspector) {
  const destination = resolve(appDirectory);
  assertDestination(destination);
  sourceInspector.inspectCandidate(resolve(sourceRoot));
  const context = realpathSync(sourceRoot);
  const sources = new Map();
  function resolveSource(name, from) {
    let owner;
    return findRuntimePackage(name, from, (path) => {
      if (owner) sourceInspector.assertOwned(owner, path);
    }, {
      inspectCandidate: (path) => sourceInspector.inspectCandidate(path),
      inspectPackage: (path, requested) => { sourceInspector.inspectPackage(path, requested); owner = path; },
    });
  }
  function sourceNode(directory) {
    const identity = key(directory);
    if (sources.has(identity)) return sources.get(identity);
    if (inside(directory, destination) || inside(destination, directory))
      throw invalid(`Runtime package source overlaps its destination: ${directory}`);
    const node = { directory, edges: [] };
    sources.set(identity, node);
    const manifest = sourceInspector.readManifest(directory);
    for (const edge of runtimeDependencyEntries(manifest)) {
      let dependency;
      try { dependency = resolveSource(edge.name, directory); }
      catch (error) {
        if (edge.optional && isRuntimePackageMissing(error)) { node.edges.push({ ...edge, node: null }); continue; }
        throw error;
      }
      node.edges.push({ ...edge, node: sourceNode(dependency) });
    }
    return node;
  }

  // Complete the source graph before making any destination writes. Direct
  // roots own their top-level slots regardless of transitive traversal order.
  const roots = [...new Set(names)].sort().map((name) => ({ name, node: sourceNode(resolveSource(name, context)) }));
  const instances = new Map(), active = new Set(), complete = new Set();
  function reserve(target, node) {
    const identity = key(target), previous = instances.get(identity);
    if (previous) {
      if (previous.node !== node) throw invalid(`Runtime package slot collision: ${target}`);
      return previous;
    }
    const instance = { target, node, edges: [] };
    instances.set(identity, instance);
    return instance;
  }
  const rootInstances = roots.map(({ name, node }) => reserve(join(destination, "node_modules", name), node));
  // Hoisting a name missing from another source context would invent an
  // optional dependency there. Keep such dependencies local when possible.
  const privateNames = new Set([...sources.values()].flatMap((node) => node.edges.filter((edge) => !edge.node).map((edge) => edge.name)));
  function visible(owner, name) {
    const resolver = createRequire(join(owner.target, "package.json"));
    for (const base of resolver.resolve.paths(`${name}/package.json`) ?? []) {
      const target = join(base, name);
      if (!inside(destination, target)) continue;
      const instance = instances.get(key(target));
      if (instance) return instance;
    }
  }
  const graphNames = [...new Set([...sources.values()].flatMap((node) => node.edges.map((edge) => edge.name)))].sort();
  function visit(owner) {
    if (complete.has(owner) || active.has(owner)) return;
    active.add(owner);
    const created = [];
    // All owner-local slots must exist before any child is traversed. A later
    // sibling edge would otherwise shadow a dependency already chosen below it.
    for (const edge of owner.node.edges) {
      if (!edge.node) { owner.edges.push({ ...edge, instance: null }); continue; }
      let dependency = visible(owner, edge.name);
      if (dependency?.node !== edge.node) {
        const top = join(destination, "node_modules", edge.name);
        const target = instances.has(key(top)) || privateNames.has(edge.name) ? join(owner.target, "node_modules", edge.name) : top;
        const existing = instances.get(key(target));
        dependency = reserve(target, edge.node);
        if (!existing) created.push(dependency);
      }
      owner.edges.push({ ...edge, instance: dependency });
    }
    // An interleaved version/alias cycle may require an infinite plain directory
    // layout. Detect a repeated source and visible environment before copying.
    const state = JSON.stringify([key(owner.node.directory), graphNames.map((name) => visible(owner, name)?.node.directory ?? null)]);
    if (activeStates.has(state) && created.length) throw invalid(`Runtime package cycle cannot be staged without changing resolution: ${owner.node.directory}`);
    const previousState = activeStates.has(state);
    activeStates.add(state);
    for (const edge of owner.edges) if (edge.instance) visit(edge.instance);
    if (!previousState) activeStates.delete(state);
    active.delete(owner);
    complete.add(owner);
  }
  const activeStates = new Set();
  for (const owner of rootInstances) visit(owner);

  // Check the finished plan as well: a slot introduced by another root may
  // change an optional's absence or expose an unsupported shadowing cycle.
  for (const owner of instances.values()) for (const edge of owner.edges) {
    const selected = visible(owner, edge.name);
    if ((selected?.node ?? null) !== edge.node) throw invalid(`Runtime package resolution changed for ${edge.name} from ${owner.node.directory}`);
  }
  assertDestination(destination);
  mkdirSync(destination, { recursive: true });
  for (const { target, node } of instances.values()) sourceInspector.copyPackage(node.directory, target);

  // Use Node's real resolver against copied bytes, never a version-string or
  // package-count approximation, and never evaluate a provider entrypoint.
  for (const owner of instances.values()) for (const edge of owner.edges) {
    let selected;
    try {
      selected = findRuntimePackage(edge.name, owner.target, (path) => {
        if (!inside(destination, path)) throw invalid(`Staged runtime dependency escapes its artifact: ${path}`);
      });
    } catch (error) {
      if (!edge.node && isRuntimePackageMissing(error)) continue;
      throw error;
    }
    if (instances.get(key(selected))?.node !== edge.node)
      throw invalid(`Staged runtime dependency changed source for ${edge.name} from ${owner.node.directory}`);
  }
  return instances.size;
}
