import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { AppKvKey, readAppKvJson, writeAppKvJson } from "@/lib/db/app-kv";
import { resolveLegacyPersistedJsonPaths } from "@/lib/quicker-agent-persisted-data";

type DeviceFingerprintFile = {
  version: 1;
  deviceId: string;
  createdAt: string;
};

let cachedDeviceId: string | null = null;

export function resolveDeviceFingerprintPath(): string {
  return resolveLegacyPersistedJsonPaths("device-fingerprint.json")[0] ?? "";
}

function normalizeFingerprint(raw: unknown): DeviceFingerprintFile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Partial<DeviceFingerprintFile>;
  const deviceId = data.deviceId?.trim();
  if (!deviceId) return null;
  return {
    version: 1,
    deviceId,
    createdAt: data.createdAt ?? new Date(0).toISOString(),
  };
}

function readFingerprintFromLegacyFile(): DeviceFingerprintFile | null {
  for (const path of resolveLegacyPersistedJsonPaths("device-fingerprint.json")) {
    if (!existsSync(path)) continue;
    try {
      const parsed = normalizeFingerprint(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
      );
      if (parsed) return parsed;
    } catch {
      // try next path
    }
  }
  return null;
}

function loadFingerprintFile(): DeviceFingerprintFile | null {
  const fromKv = readAppKvJson<DeviceFingerprintFile>(AppKvKey.deviceFingerprint);
  if (fromKv) return normalizeFingerprint(fromKv);
  const fromFile = readFingerprintFromLegacyFile();
  if (fromFile) {
    writeAppKvJson(AppKvKey.deviceFingerprint, fromFile);
    return fromFile;
  }
  return null;
}

/** Stable per-machine id persisted in agent.db app_kv. */
export function getOrCreateDeviceFingerprint(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = loadFingerprintFile();
  if (existing) {
    cachedDeviceId = existing.deviceId;
    return cachedDeviceId;
  }

  const created: DeviceFingerprintFile = {
    version: 1,
    deviceId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  writeAppKvJson(AppKvKey.deviceFingerprint, created);
  cachedDeviceId = created.deviceId;
  return cachedDeviceId;
}
