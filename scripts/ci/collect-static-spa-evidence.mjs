import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWindowsPackageMetadataInspector } from "../../agent-gui/scripts/runtime-package-metadata.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const totalLimit = 32 * 1024 * 1024, pngLimit = 5 * 1024 * 1024, fileLimit = 32;

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
      const info = lstatSync(path);
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
  function textTail(source, name, limit) {
    const info = inspect(source);
    if (!info) return;
    const fd = openSync(source, "r");
    try {
      const data = Buffer.alloc(Math.min(info.size, limit));
      const read = readSync(fd, data, 0, data.length, Math.max(0, info.size - data.length));
      save(name, data.subarray(0, read));
    } finally { closeSync(fd); }
  }
  try {
    inspect(temporary, true); inspect(bucket, true); inspect(output, true);
    mkdirSync(output, { recursive: true }); inspect(output, true);
    textTail(join(bucket, "browser.log"), "browser-tail.log", 256 * 1024);
    textTail(join(bucket, "suite.log"), "suite-tail.log", 256 * 1024);
    const fixtures = readdirSync(temporary).filter((name) => /^static-runtime-integration-[A-Za-z0-9_-]+$/.test(name)).sort();
    for (const name of fixtures) {
      const fixture = join(temporary, name); inspect(fixture, true);
      for (const leaf of ["primary-failure.txt", "failure-dom.txt", "service-stderr.log"])
        textTail(join(fixture, leaf), `${name}-${leaf}`, 64 * 1024);
      for (const leaf of readdirSync(fixture).filter((value) => /^[A-Za-z0-9_-]+\.png$/.test(value)).sort()) {
        const source = join(fixture, leaf), info = inspect(source);
        if (!info) continue;
        if (info.size > pngLimit) { omit(`${name}-${leaf}`, "PNG size limit"); continue; }
        if (report.files.length >= fileLimit || report.totalBytes + info.size > totalLimit) { omit(`${name}-${leaf}`, "artifact budget"); continue; }
        save(`${name}-${leaf}`, readFileSync(source));
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
