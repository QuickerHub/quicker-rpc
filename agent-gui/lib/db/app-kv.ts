import type Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { getAgentSqlite } from "@/lib/db/client";
import { resolveLegacyPersistedJsonPaths } from "@/lib/quicker-agent-persisted-data";

export const AppKvKey = {
  llmSecrets: "llm.secrets",
  deviceFingerprint: "device.fingerprint",
  llmEndpointPref: "llm.endpoint_pref",
  launcherResolvePresets: "launcher.resolve_presets",
  launcherCommandCache: "launcher.command_cache",
  llmRemotePublishConfig: "llm.remote_publish_config",
} as const;

export type AppKvKeyName = (typeof AppKvKey)[keyof typeof AppKvKey];

const LEGACY_JSON_TO_KV: Record<string, AppKvKeyName> = {
  "llm-secrets.json": AppKvKey.llmSecrets,
  "device-fingerprint.json": AppKvKey.deviceFingerprint,
  "llm-endpoint-pref.json": AppKvKey.llmEndpointPref,
  "launcher-resolve-presets.json": AppKvKey.launcherResolvePresets,
  "launcher-command-cache.json": AppKvKey.launcherCommandCache,
  "llm-remote-publish.config.json": AppKvKey.llmRemotePublishConfig,
};

function readKvRaw(sqlite: Database.Database, key: string): string | null {
  const row = sqlite
    .prepare("SELECT value_json FROM app_kv WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  return row?.value_json ?? null;
}

export function readAppKvJson<T>(key: AppKvKeyName): T | null {
  const sqlite = getAgentSqlite();
  const raw = readKvRaw(sqlite, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeAppKvJson<T>(key: AppKvKeyName, value: T): void {
  const sqlite = getAgentSqlite();
  const valueJson = JSON.stringify(value);
  const updatedAt = Date.now();
  sqlite
    .prepare(
      `INSERT INTO app_kv (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(key, valueJson, updatedAt);
}

export function deleteAppKv(key: AppKvKeyName): void {
  const sqlite = getAgentSqlite();
  sqlite.prepare("DELETE FROM app_kv WHERE key = ?").run(key);
}

function importLegacyJsonFile(sqlite: Database.Database, filename: string, key: AppKvKeyName): void {
  if (readKvRaw(sqlite, key)) return;
  for (const path of resolveLegacyPersistedJsonPaths(filename)) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, "utf8");
      JSON.parse(text);
      sqlite
        .prepare(
          `INSERT INTO app_kv (key, value_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO NOTHING`,
        )
        .run(key, text.trim(), Date.now());
      return;
    } catch {
      // try next candidate
    }
  }
}

/** Import legacy JSON settings into app_kv after schema migration. */
export function seedAppKvFromLegacyJsonFiles(sqlite: Database.Database): void {
  for (const [filename, key] of Object.entries(LEGACY_JSON_TO_KV)) {
    importLegacyJsonFile(sqlite, filename, key);
  }
}
