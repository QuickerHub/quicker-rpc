import { createHash } from "node:crypto";
import { resolveRemotePublishCipherPepper } from "@/lib/llm-remote-cipher-pepper";

/** Keep algorithm in sync with scripts/llm-secret-cipher.mjs (bundled path only). */
const BUNDLED_LLM_CIPHER_PEPPER = "QuickerAgent-bundled-llm-v1";

/** Fixed scope for Bitiful OSS publish config (not tied to app install version). */
export const REMOTE_PUBLISH_CIPHER_SCOPE = "remote-publish-v1";
export const REMOTE_PUBLISH_CIPHER_KEY_VERSION = "v1";

// Pepper: LLM_REMOTE_PUBLISH_CIPHER_PEPPER env / llm-remote-cipher-pepper.json only.
// Never hardcode here; never rotate in routine publish — all agent versions share one OSS key.

export function deriveCipherKey(
  appVersion: string,
  providerId: string,
): Buffer {
  return createHash("sha256")
    .update(`${BUNDLED_LLM_CIPHER_PEPPER}:${appVersion}:${providerId}`, "utf8")
    .digest();
}

function deriveRemotePublishCipherKey(): Buffer {
  const pepper = resolveRemotePublishCipherPepper();
  return createHash("sha256")
    .update(
      `${pepper}:${REMOTE_PUBLISH_CIPHER_KEY_VERSION}:${REMOTE_PUBLISH_CIPHER_SCOPE}`,
      "utf8",
    )
    .digest();
}

function xorWithKey(plaintext: string, key: Buffer): string {
  const input = Buffer.from(plaintext, "utf8");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("base64");
}

function xorDecode(encoded: string, key: Buffer): string {
  const input = Buffer.from(encoded, "base64");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("utf8");
}

export function encodeSecret(
  plaintext: string,
  appVersion: string,
  providerId: string,
): string {
  return xorWithKey(plaintext, deriveCipherKey(appVersion, providerId));
}

export function decodeSecret(
  encoded: string,
  appVersion: string,
  providerId: string,
): string {
  return xorDecode(encoded, deriveCipherKey(appVersion, providerId));
}

export function encodeRemotePublishPayload(plaintext: string): string {
  return xorWithKey(plaintext, deriveRemotePublishCipherKey());
}

export function decodeRemotePublishPayload(encoded: string): string {
  return xorDecode(encoded, deriveRemotePublishCipherKey());
}
