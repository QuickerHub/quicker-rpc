import { createHash } from "node:crypto";

/** Keep algorithm in sync with scripts/llm-secret-cipher.mjs */
const PEPPER = "QuickerAgent-bundled-llm-v1";

export function deriveCipherKey(
  appVersion: string,
  providerId: string,
): Buffer {
  return createHash("sha256")
    .update(`${PEPPER}:${appVersion}:${providerId}`, "utf8")
    .digest();
}

export function encodeSecret(
  plaintext: string,
  appVersion: string,
  providerId: string,
): string {
  const key = deriveCipherKey(appVersion, providerId);
  const input = Buffer.from(plaintext, "utf8");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("base64");
}

export function decodeSecret(
  encoded: string,
  appVersion: string,
  providerId: string,
): string {
  const key = deriveCipherKey(appVersion, providerId);
  const input = Buffer.from(encoded, "base64");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("utf8");
}
