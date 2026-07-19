import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readQuickerRpcSemverFromJson,
} from "../../scripts/lib/quicker-rpc-version.mjs";

/** @param {string} resourcesRoot @param {import('electron').App} app */
export function hostVersion(resourcesRoot, app) {
  try {
    const raw = readFileSync(join(resourcesRoot, "app", "version.json"), "utf8");
    const data = JSON.parse(raw);
    const semver = readQuickerRpcSemverFromJson(data);
    if (semver) {
      return semver;
    }
  } catch {
    // fall through
  }
  return app.getVersion();
}
