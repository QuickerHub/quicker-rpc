import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Electron shell must not import repository-only build helpers. */
function readBundledQuickerRpcSemver(json) {
  if (!json || typeof json !== "object") {
    throw new Error("invalid version.json");
  }

  const legacy = typeof json.QuickerRpc === "string" ? json.QuickerRpc.trim() : "";
  const release = typeof json.release === "string" ? json.release.trim() : "";
  const full = legacy || release;
  const parts = full.replace(/^v/i, "").split(".");
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !/^\d+$/.test(part))) {
    throw new Error("version must contain three numeric segments");
  }
  return parts.slice(0, 3).join(".");
}

/** @param {string} resourcesRoot @param {import('electron').App} app */
export function hostVersion(resourcesRoot, app) {
  try {
    const raw = readFileSync(join(resourcesRoot, "app", "version.json"), "utf8");
    const data = JSON.parse(raw);
    const semver = readBundledQuickerRpcSemver(data);
    if (semver) {
      return semver;
    }
  } catch {
    // fall through
  }
  return app.getVersion();
}
