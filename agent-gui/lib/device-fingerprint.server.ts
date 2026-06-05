import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";

type DeviceFingerprintFile = {
  version: 1;
  deviceId: string;
  createdAt: string;
};

let cachedDeviceId: string | null = null;

export function resolveDeviceFingerprintPath(): string {
  return join(resolveAgentGuiRoot(), ".local", "device-fingerprint.json");
}

function readFingerprintFile(path: string): DeviceFingerprintFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DeviceFingerprintFile>;
    const deviceId = raw.deviceId?.trim();
    if (!deviceId) return null;
    return {
      version: 1,
      deviceId,
      createdAt: raw.createdAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function writeFingerprintFile(path: string, data: DeviceFingerprintFile): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

/** Stable per-machine id persisted under agent-gui/.local. */
export function getOrCreateDeviceFingerprint(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const path = resolveDeviceFingerprintPath();
  const existing = readFingerprintFile(path);
  if (existing) {
    cachedDeviceId = existing.deviceId;
    return cachedDeviceId;
  }

  const created: DeviceFingerprintFile = {
    version: 1,
    deviceId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  writeFingerprintFile(path, created);
  cachedDeviceId = created.deviceId;
  return cachedDeviceId;
}
