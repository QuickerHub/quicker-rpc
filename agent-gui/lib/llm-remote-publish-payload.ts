import {
  decodeRemotePublishPayload,
  encodeRemotePublishPayload,
} from "@/lib/llm-secret-cipher";

export type RemotePublishEncryptedFile = {
  version: 1;
  enc: string;
};

function isEncryptedRemotePublishFile(raw: unknown): raw is RemotePublishEncryptedFile {
  if (typeof raw !== "object" || raw === null) return false;
  const data = raw as Partial<RemotePublishEncryptedFile>;
  return data.version === 1
    && typeof data.enc === "string"
    && data.enc.trim().length > 0
    && !Array.isArray((raw as { endpoints?: unknown }).endpoints);
}

function isPlainPublishConfig(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  return Array.isArray((raw as { endpoints?: unknown }).endpoints);
}

/** Wrap publish config JSON for public OSS upload. */
export function wrapRemotePublishConfigForUpload(config: unknown): RemotePublishEncryptedFile {
  const json = JSON.stringify(config);
  return {
    version: 1,
    enc: encodeRemotePublishPayload(json),
  };
}

/** Parse OSS payload: encrypted wrapper or legacy plain publish config. */
export function unwrapRemotePublishConfigPayload(raw: unknown): unknown {
  if (isEncryptedRemotePublishFile(raw)) {
    try {
      const json = decodeRemotePublishPayload(raw.enc.trim());
      return JSON.parse(json) as unknown;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to decrypt remote publish config: ${message}`);
    }
  }

  if (isPlainPublishConfig(raw)) {
    return raw;
  }

  throw new Error(
    "Remote publish config must be encrypted { version: 1, enc } or plain publish JSON with endpoints.",
  );
}
