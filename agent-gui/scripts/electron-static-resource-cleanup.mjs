import { lstatSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const retiredMarkers = [
  "voice-plugin-channel.json",
  "voice-plugin-manifest.json",
  "voice-sensevoice-model-identity.json",
  "plugin-registry-bootstrap.json",
];

/** Remove only retired generated root markers, never a resource tree or user data. */
export function cleanupRetiredStaticResourceMarkers(resourcesDirectory) {
  if (!isAbsolute(resourcesDirectory)) throw new Error("Static resource cleanup requires an absolute directory");
  const root = resolve(resourcesDirectory), ancestors = [];
  if (/(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(root)) throw new Error("Static resource cleanup cannot use a cloud directory");
  for (let path = root; ; path = dirname(path)) { ancestors.push(path); if (dirname(path) === path) break; }
  for (const path of ancestors.reverse()) {
    let metadata;
    try { metadata = lstatSync(path); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`Static resource cleanup refuses a redirected or non-directory ancestor: ${path}`);
  }
  const pending = [];
  for (const name of retiredMarkers) {
    const path = join(root, name);
    let metadata;
    try { metadata = lstatSync(path); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Retired static resource marker is not a regular file: ${path}`);
    pending.push({ name, path });
  }
  for (const { path } of pending) unlinkSync(path);
  return pending.map(({ name }) => name);
}
