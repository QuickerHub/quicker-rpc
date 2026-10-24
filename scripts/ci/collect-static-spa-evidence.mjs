import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWindowsPackageMetadataInspector } from "../../agent-gui/scripts/runtime-package-metadata.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const totalLimit = 32 * 1024 * 1024, pngLimit = 5 * 1024 * 1024, fileLimit = 32;
const fingerprint = (info) => [info.ino, info.mode, info.nlink, info.size, info.mtimeNs, info.ctimeNs, info.birthtimeNs].map(String).join(":");
const sameSnapshot = (left, right) => (left.dev === right.dev
  // Some Windows path stats omit the device id while handle stats include it.
  || process.platform === "win32" && (left.dev === 0n || right.dev === 0n))
  && fingerprint(left) === fingerprint(right);

/** Failure evidence only. Never descend into app, workspace, profile or DB trees. */
export function collectStaticSpaEvidence({ repositoryDirectory = repository,
  inspectMetadata = createWindowsPackageMetadataInspector() } = {}) {
  const root = resolve(repositoryDirectory), temporary = join(root, ".tmp"), bucket = join(temporary, "static-spa-ci"), output = join(bucket, "artifacts");
  const report = { format: "quicker-static-spa-ci-evidence", version: 1, files: [], omitted: [], omittedCount: 0, totalBytes: 0 };
  const omit = (name, reason) => { report.omittedCount++; if (report.omitted.length < 64) report.omitted.push({ name, reason }); };
  function inspect(path, directory = false) {
    if (/(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(path)) throw new Error("Cloud paths cannot supply SPA evidence");
    inspectMetadata([path]);
    const parents = [];
    for (let cursor = dirname(path); ; cursor = dirname(cursor)) { parents.push(cursor); if (dirname(cursor) === cursor) break; }
    for (const cursor of parents.reverse()) {
      try { const info = lstatSync(cursor); if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Redirected SPA evidence ancestor: ${cursor}`); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    try {
      const info = lstatSync(path, { bigint: true });
      if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error(`Invalid SPA evidence entry: ${path}`);
      return info;
    } catch (error) { if (error.code === "ENOENT") return; throw error; }
  }
  function save(name, bytes) {
    if (report.files.length >= fileLimit || report.totalBytes + bytes.length > totalLimit) { omit(name, "artifact budget"); return; }
    inspect(output, true);
    writeFileSync(join(output, name), bytes, { flag: "wx" });
    report.files.push({ name, bytes: bytes.length }); report.totalBytes += bytes.length;
  }
  function sourceSnapshot(source, name) {
    const info = inspect(source);
    if (info && info.nlink !== 1n) { omit(name, "hard-linked source"); return; }
    return info;
  }
  function readBounded(source, name, info, limit, tail = false) {
    const fd = openSync(source, "r");
    try {
      // A path can change after inspection. Recheck the opened handle before
      // reading bytes, then allocate only the approved bounded snapshot size.
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.nlink !== 1n || !sameSnapshot(opened, info)) { omit(name, "source changed after inspection"); return null; }
      const size = Number(opened.size);
      if (!Number.isSafeInteger(size)) { omit(name, "unsupported source size"); return null; }
      const data = Buffer.alloc(Math.min(size, limit)), start = tail ? Math.max(0, size - data.length) : 0;
      let offset = 0;
      while (offset < data.length) {
        const read = readSync(fd, data, offset, data.length - offset, start + offset);
        if (!read) break;
        offset += read;
      }
      const after = fstatSync(fd, { bigint: true });
      if (offset !== data.length || !after.isFile() || after.nlink !== 1n || !sameSnapshot(after, opened)) { omit(name, "source changed during read"); return null; }
      return data;
    } finally { closeSync(fd); }
  }
  function textTail(source, name, limit) {
    const info = sourceSnapshot(source, name);
    if (!info) return;
    const data = readBounded(source, name, info, limit, true);
    if (data !== null) save(name, data);
  }
  function phaseTimeline(source, name) {
    const info = sourceSnapshot(source, name), limit = 16 * 1024;
    if (!info) return;
    if (info.size > limit) { omit(name, "phase size limit"); return; }
    const data = readBounded(source, name, info, limit);
    if (data === null) return;
    let value;
    try { value = JSON.parse(data.toString("utf8")); }
    catch { omit(name, "invalid phase timeline"); return; }
    if (!value || typeof value !== "object" || Array.isArray(value)
      || value.format !== "static-spa-phase-timeline" || value.version !== 1 || !Array.isArray(value.phases)
      || value.phases.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry)
        || typeof entry.phase !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(entry.phase)
        || typeof entry.elapsedMs !== "number" || !Number.isFinite(entry.elapsedMs))) {
      omit(name, "invalid phase timeline"); return;
    }
    // This one generated JSON has an explicit schema. Never forward other
    // properties, request bodies, profiles or arbitrary JSON diagnostics.
    const sanitized = Buffer.from(JSON.stringify({ format: value.format, version: value.version,
      phases: value.phases.map(({ phase, elapsedMs }) => ({ phase, elapsedMs })) }) + "\n");
    if (sanitized.length > limit) { omit(name, "phase size limit"); return; }
    save(name, sanitized);
  }
  try {
    inspect(temporary, true); inspect(bucket, true); inspect(output, true);
    mkdirSync(output, { recursive: true }); inspect(output, true);
    textTail(join(bucket, "browser.log"), "browser-tail.log", 256 * 1024);
    textTail(join(bucket, "suite.log"), "suite-tail.log", 256 * 1024);
    const fixtures = readdirSync(temporary).filter((name) => /^static-runtime-integration-[A-Za-z0-9_-]+$/.test(name)).sort();
    for (const name of fixtures) {
      const fixture = join(temporary, name); inspect(fixture, true);
      phaseTimeline(join(fixture, "phase-timeline.json"), `${name}-phase-timeline.json`);
      for (const leaf of ["primary-failure.txt", "failure-dom.txt", "service-stderr.log"])
        textTail(join(fixture, leaf), `${name}-${leaf}`, 64 * 1024);
      for (const leaf of readdirSync(fixture).filter((value) => /^[A-Za-z0-9_-]+\.png$/.test(value)).sort()) {
        const source = join(fixture, leaf), info = sourceSnapshot(source, `${name}-${leaf}`);
        if (!info) continue;
        if (info.size > pngLimit) { omit(`${name}-${leaf}`, "PNG size limit"); continue; }
        if (report.files.length >= fileLimit || report.totalBytes + Number(info.size) > totalLimit) { omit(`${name}-${leaf}`, "artifact budget"); continue; }
        const data = readBounded(source, `${name}-${leaf}`, info, pngLimit);
        if (data !== null) save(`${name}-${leaf}`, data);
      }
    }
    inspect(output, true);
    writeFileSync(join(output, "manifest.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(`Collected ${report.files.length} bounded SPA evidence files (${report.totalBytes} bytes)`);
    return report;
  } finally { inspectMetadata.dispose?.(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { collectStaticSpaEvidence(); } catch (error) { console.error(error); process.exitCode = 1; }
}
