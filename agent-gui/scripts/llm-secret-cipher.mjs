/**
 * Obfuscation for bundled LLM API keys (not encryption).
 * Keep bundled algorithm in sync with lib/llm-secret-cipher.ts.
 * Remote OSS publish config pepper: LLM_REMOTE_PUBLISH_CIPHER_PEPPER env only.
 */
import { createHash } from "node:crypto";

const BUNDLED_LLM_CIPHER_PEPPER = "QuickerAgent-bundled-llm-v1";
const REMOTE_PUBLISH_CIPHER_SCOPE = "remote-publish-v1";
const REMOTE_PUBLISH_CIPHER_KEY_VERSION = "v1";

/** @param {string} appVersion @param {string} providerId */
export function deriveCipherKey(appVersion, providerId) {
  return createHash("sha256")
    .update(`${BUNDLED_LLM_CIPHER_PEPPER}:${appVersion}:${providerId}`, "utf8")
    .digest();
}

function resolveRemotePublishCipherPepper() {
  const pepper = process.env.LLM_REMOTE_PUBLISH_CIPHER_PEPPER?.trim();
  if (!pepper) {
    throw new Error(
      "LLM_REMOTE_PUBLISH_CIPHER_PEPPER is required (publish/.env or GitHub publish environment).",
    );
  }
  return pepper;
}

function deriveRemotePublishCipherKey() {
  const pepper = resolveRemotePublishCipherPepper();
  return createHash("sha256")
    .update(
      `${pepper}:${REMOTE_PUBLISH_CIPHER_KEY_VERSION}:${REMOTE_PUBLISH_CIPHER_SCOPE}`,
      "utf8",
    )
    .digest();
}

/** @param {string} plaintext @param {Buffer} key */
function xorWithKey(plaintext, key) {
  const input = Buffer.from(plaintext, "utf8");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("base64");
}

/** @param {string} encoded @param {Buffer} key */
function xorDecode(encoded, key) {
  const input = Buffer.from(encoded, "base64");
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ key[i % key.length];
  }
  return out.toString("utf8");
}

/** @param {string} plaintext @param {string} appVersion @param {string} providerId */
export function encodeSecret(plaintext, appVersion, providerId) {
  return xorWithKey(plaintext, deriveCipherKey(appVersion, providerId));
}

/** @param {string} encoded @param {string} appVersion @param {string} providerId */
export function decodeSecret(encoded, appVersion, providerId) {
  return xorDecode(encoded, deriveCipherKey(appVersion, providerId));
}

/** @param {string} plaintext */
export function encodeRemotePublishPayload(plaintext) {
  return xorWithKey(plaintext, deriveRemotePublishCipherKey());
}

/** @param {string} encoded */
export function decodeRemotePublishPayload(encoded) {
  return xorDecode(encoded, deriveRemotePublishCipherKey());
}
