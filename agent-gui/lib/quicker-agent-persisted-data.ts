import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import {
  QUICKER_AGENT_DIRNAME,
  resolveQuickerAgentAppDataDirectory,
  resolveQuickerAgentInstallDirectory,
} from "@/lib/quicker-agent-paths";

/** @deprecated Legacy subfolder; new settings live in agent.db app_kv. */
export const QUICKER_AGENT_PERSISTED_DATA_SUBDIR = "local";

let migrationDone = false;

/** Legacy install-relative folder (dev: agent-gui/.local; release: resources/app/.local). */
export function resolveLegacyInstallPersistedDataDirectory(): string {
  return join(resolveAgentGuiRoot(), ".local");
}

/**
 * Durable app data root for server-side files (llm-usage dirs, etc.).
 * Windows: %APPDATA%/QuickerAgent — separate from the NSIS install tree.
 */
export function resolveQuickerAgentPersistedDataDirectory(): string {
  ensurePersistedDataMigrated();
  const dir = resolveQuickerAgentAppDataDirectory();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolvePersistedDataFilePath(...segments: string[]): string {
  return join(resolveQuickerAgentPersistedDataDirectory(), ...segments);
}

export function resolvePersistedDataDirPath(...segments: string[]): string {
  return join(resolveQuickerAgentPersistedDataDirectory(), ...segments);
}

/** Candidate paths for a legacy JSON settings file (newest layout first). */
export function resolveLegacyPersistedJsonPaths(filename: string): string[] {
  const appData = resolveQuickerAgentAppDataDirectory();
  const installRoot = resolveQuickerAgentInstallDirectory();
  const candidates = [
    join(appData, filename),
    join(appData, QUICKER_AGENT_PERSISTED_DATA_SUBDIR, filename),
    join(installRoot, QUICKER_AGENT_PERSISTED_DATA_SUBDIR, filename),
    join(installRoot, "resources", "app", ".local", filename),
    join(installRoot, "resources", "resources", "app", ".local", filename),
    join(resolveLegacyInstallPersistedDataDirectory(), filename),
  ];
  return candidates.filter((path, index, all) => all.indexOf(path) === index);
}

function directoryHasEntries(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return readdirSync(path).length > 0;
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function mergeLegacyTree(legacyRoot: string, targetRoot: string): void {
  if (!existsSync(legacyRoot)) return;
  mkdirSync(targetRoot, { recursive: true });

  for (const name of readdirSync(legacyRoot)) {
    const src = join(legacyRoot, name);
    const dest = join(targetRoot, name);
    if (existsSync(dest)) {
      if (isDirectory(src) && isDirectory(dest)) {
        mergeLegacyTree(src, dest);
      }
      continue;
    }
    cpSync(src, dest, { recursive: true });
  }
}

function resolveColocatedInstallPersistedDataDirectories(): string[] {
  const installRoot = resolveQuickerAgentInstallDirectory();
  const candidates = [
    join(installRoot, "resources", "app", ".local"),
    join(installRoot, "resources", "resources", "app", ".local"),
    join(installRoot, "resources", "app", "local"),
    join(installRoot, "resources", "resources", "app", "local"),
    join(installRoot, QUICKER_AGENT_PERSISTED_DATA_SUBDIR),
  ];
  return candidates.filter(
    (path, index) => candidates.indexOf(path) === index && existsSync(path),
  );
}

function migrateInstallTreeToAppData(): void {
  const installRoot = resolveQuickerAgentInstallDirectory();
  const appDataRoot = resolveQuickerAgentAppDataDirectory();
  if (
    installRoot.replace(/\\/g, "/").toLowerCase()
    === appDataRoot.replace(/\\/g, "/").toLowerCase()
  ) {
    return;
  }
  if (!existsSync(installRoot)) return;

  for (const subdir of ["plugins", "cache", "agent-defs", "llm-usage", "local"]) {
    mergeLegacyTree(join(installRoot, subdir), join(appDataRoot, subdir));
  }
}

function ensurePersistedDataMigrated(): void {
  if (migrationDone) return;
  migrationDone = true;

  migrateInstallTreeToAppData();

  const targetRoot = resolveQuickerAgentAppDataDirectory();
  mkdirSync(targetRoot, { recursive: true });

  const legacyRoots = [
    resolveLegacyInstallPersistedDataDirectory(),
    ...resolveColocatedInstallPersistedDataDirectories(),
  ].filter((path, index, all) => all.indexOf(path) === index);

  for (const legacyRoot of legacyRoots) {
    if (!directoryHasEntries(legacyRoot)) continue;
    if (!directoryHasEntries(targetRoot)) {
      cpSync(legacyRoot, targetRoot, { recursive: true });
      continue;
    }
    mergeLegacyTree(legacyRoot, targetRoot);
  }
}

/** @internal test helper */
export function resetPersistedDataMigrationForTests(): void {
  migrationDone = false;
}

/** @internal test helper */
export function isPersistedDataPath(path: string): boolean {
  const root = resolveQuickerAgentAppDataDirectory();
  const normalized = path.replace(/\\/g, "/");
  const rootNorm = root.replace(/\\/g, "/");
  return normalized === rootNorm || normalized.startsWith(`${rootNorm}/`);
}
