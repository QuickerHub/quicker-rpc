import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { resolveQuickerAgentAppDataDirectory } from "@/lib/quicker-agent-paths";

/** User-writable server config (LLM keys, usage, launcher presets). Lives outside the install dir. */
export const QUICKER_AGENT_PERSISTED_DATA_SUBDIR = "local";

let migrationDone = false;

/** Legacy install-relative folder (dev: agent-gui/.local; release: resources/app/.local). */
export function resolveLegacyInstallPersistedDataDirectory(): string {
  return join(resolveAgentGuiRoot(), ".local");
}

/**
 * Durable app data for settings written by the Next server.
 * Windows: %LOCALAPPDATA%/QuickerAgent/local — survives NSIS in-place updates.
 */
export function resolveQuickerAgentPersistedDataDirectory(): string {
  ensurePersistedDataMigrated();
  const dir = join(
    resolveQuickerAgentAppDataDirectory(),
    QUICKER_AGENT_PERSISTED_DATA_SUBDIR,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolvePersistedDataFilePath(...segments: string[]): string {
  return join(resolveQuickerAgentPersistedDataDirectory(), ...segments);
}

export function resolvePersistedDataDirPath(...segments: string[]): string {
  return join(resolveQuickerAgentPersistedDataDirectory(), ...segments);
}

function directoryHasEntries(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return readdirSync(path).length > 0;
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
    if (existsSync(dest)) continue;
    cpSync(src, dest, { recursive: true });
  }
}

function ensurePersistedDataMigrated(): void {
  if (migrationDone) return;
  migrationDone = true;

  const legacyRoot = resolveLegacyInstallPersistedDataDirectory();
  const targetRoot = join(
    resolveQuickerAgentAppDataDirectory(),
    QUICKER_AGENT_PERSISTED_DATA_SUBDIR,
  );

  if (!directoryHasEntries(legacyRoot)) return;

  if (!directoryHasEntries(targetRoot)) {
    mkdirSync(targetRoot, { recursive: true });
    cpSync(legacyRoot, targetRoot, { recursive: true });
    return;
  }

  mergeLegacyTree(legacyRoot, targetRoot);
}

/** @internal test helper */
export function resetPersistedDataMigrationForTests(): void {
  migrationDone = false;
}

/** @internal test helper */
export function isPersistedDataPath(path: string): boolean {
  const root = join(
    resolveQuickerAgentAppDataDirectory(),
    QUICKER_AGENT_PERSISTED_DATA_SUBDIR,
  );
  const normalized = path.replace(/\\/g, "/");
  const rootNorm = root.replace(/\\/g, "/");
  return normalized === rootNorm || normalized.startsWith(`${rootNorm}/`);
}
