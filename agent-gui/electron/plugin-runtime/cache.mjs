import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readCachedJson(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const envelope = JSON.parse(raw);
    const nowMs = Date.now();
    const ttlMs = Number(envelope.ttlHours ?? 0) * 3_600_000;
    if (nowMs - Number(envelope.fetchedAtMs ?? 0) > ttlMs) {
      return null;
    }
    return envelope.payload;
  } catch {
    return null;
  }
}

export function readStaleCachedJson(path) {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw).payload;
  } catch {
    return null;
  }
}

export function writeCachedJson(path, payload, ttlHours) {
  mkdirSync(dirname(path), { recursive: true });
  const envelope = {
    fetchedAtMs: Date.now(),
    ttlHours,
    payload,
  };
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}
