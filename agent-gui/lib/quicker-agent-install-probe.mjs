/**
 * Distinguish installed QuickerAgent (NSIS under %LOCALAPPDATA%/QuickerAgent)
 * from repo dev builds (agent-gui/src-tauri/target, tauri dev shell).
 */
import { join } from "node:path";

const DEV_PATH_MARKERS = [
  "\\agent-gui\\",
  "/agent-gui/",
  "\\src-tauri\\target\\",
  "/src-tauri/target/",
];

/** @param {string} value */
export function normalizeProbePath(value) {
  return (value ?? "").trim().replace(/\//g, "\\").toLowerCase();
}

/** @param {string} pathNorm */
function hasDevPathMarker(pathNorm) {
  return DEV_PATH_MARKERS.some((marker) =>
    pathNorm.includes(normalizeProbePath(marker)),
  );
}

/** @returns {string | null} */
export function resolveInstalledQuickerAgentDirectory() {
  const local = process.env.LOCALAPPDATA?.trim();
  if (!local) {
    return null;
  }
  return join(local, "QuickerAgent");
}

function resolveInstalledQuickerAgentDirectoryNorm() {
  const dir = resolveInstalledQuickerAgentDirectory();
  return dir ? normalizeProbePath(dir) : null;
}

/** @param {string} pathNorm */
function isUnderInstalledQuickerAgentRoot(pathNorm) {
  const installRoot = resolveInstalledQuickerAgentDirectoryNorm();
  if (!installRoot || !pathNorm) {
    return false;
  }
  return pathNorm === installRoot || pathNorm.startsWith(`${installRoot}\\`);
}

/** @param {string} pathRaw */
function isInstalledProductionQuickerAgentPath(pathRaw) {
  const pathNorm = normalizeProbePath(pathRaw);
  if (!pathNorm) {
    return false;
  }
  if (hasDevPathMarker(pathNorm)) {
    return false;
  }
  if (
    isUnderInstalledQuickerAgentRoot(pathNorm)
    && pathNorm.endsWith("\\quicker-agent.exe")
  ) {
    return true;
  }
  return (
    /\\quickeragent\\quicker-agent\.exe$/i.test(pathNorm)
    || /\\programs\\quickeragent\\quicker-agent\.exe$/i.test(pathNorm)
  );
}

/** @param {string} pathRaw */
function isBundledProductionUiNodePath(pathRaw) {
  const pathNorm = normalizeProbePath(pathRaw);
  if (!pathNorm || hasDevPathMarker(pathNorm)) {
    return false;
  }
  const installRoot = resolveInstalledQuickerAgentDirectoryNorm();
  if (installRoot) {
    for (const nodePrefix of [
      `${installRoot}\\resources\\node\\`,
      `${installRoot}\\resources\\resources\\node\\`,
    ]) {
      if (pathNorm.includes(nodePrefix) && pathNorm.includes("server.js")) {
        return true;
      }
    }
  }
  const legacyRoot = resolveInstalledQuickerAgentDirectoryNorm()?.replace(
    /\\programs\\quickeragent$/,
    "\\quickeragent",
  );
  if (legacyRoot) {
    for (const nodePrefix of [
      `${legacyRoot}\\resources\\node\\`,
      `${legacyRoot}\\resources\\resources\\node\\`,
    ]) {
      if (pathNorm.includes(nodePrefix) && pathNorm.includes("server.js")) {
        return true;
      }
    }
  }
  return (
    pathNorm.includes("\\quickeragent\\resources\\node\\")
    && pathNorm.includes("server.js")
  );
}

/** @param {string} cmdLower @param {string} [executablePathLower] */
export function isInstalledProductionQuickerAgentProcess(
  name,
  cmdLower,
  executablePathLower = "",
) {
  if (normalizeProbePath(name) !== "quicker-agent.exe") {
    return false;
  }
  const cmd = cmdLower ?? "";
  const exe = executablePathLower ?? "";
  if (isInstalledProductionQuickerAgentPath(cmd)) {
    return true;
  }
  return isInstalledProductionQuickerAgentPath(exe);
}

/** @param {string} cmdLower @param {string} [executablePathLower] */
export function isBundledProductionUiNodeProcess(
  name,
  cmdLower,
  executablePathLower = "",
) {
  if (normalizeProbePath(name) !== "node.exe") {
    return false;
  }
  const pathText = `${cmdLower ?? ""} ${executablePathLower ?? ""}`.trim();
  return isBundledProductionUiNodePath(pathText);
}

/** @param {string} cmdLower @param {string} [executablePathLower] */
export function isProductionQuickerAgentUiProcess(
  name,
  cmdLower,
  executablePathLower = "",
) {
  return (
    isInstalledProductionQuickerAgentProcess(name, cmdLower, executablePathLower)
    || isBundledProductionUiNodeProcess(name, cmdLower, executablePathLower)
  );
}
