/**
 * Obfuscation for bundled LLM API keys (not encryption).
 * Keep algorithm in sync with lib/llm-secret-cipher.ts.
 */
import { createHash } from "node:crypto";

const PEPPER = "QuickerAgent-bundled-llm-v1";

/** @param {string} appVersion @param {string} providerId */
export function deriveCipherKey(appVersion, providerId) {
  return createHash("sha256")
    .update(`${PEPPER}:${appVersion}:${providerId}`, "utf8")
    .digest();
}

/** @param {string} plaintext @param {string} appVersion @param {string} providerId */
export function encodeSecret(plaintext, appVersion, providerId) {
  const key = deriveCipherKey(appVersion, providerId);
  const input = Buffer.from(plaintext, "utf8");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("base64");
}

/** @param {string} encoded @param {string} appVersion @param {string} providerId */
export function decodeSecret(encoded, appVersion, providerId) {
  const key = deriveCipherKey(appVersion, providerId);
  const input = Buffer.from(encoded, "base64");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("utf8");
}
