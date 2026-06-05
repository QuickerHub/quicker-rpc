import { getOrCreateDeviceFingerprint } from "@/lib/device-fingerprint.server";
import {
  fetchQuickerAccount,
  type QuickerAccountSnapshot,
} from "@/lib/quicker-account.server";

export type LlmUsageIdentityKind = "quicker" | "device";

export type LlmUsageIdentity = {
  kind: LlmUsageIdentityKind;
  /** Quicker userId or local device fingerprint uuid. */
  id: string;
  /** Key used for usage file paths (device ids are prefixed). */
  storageKey: string;
};

const DEVICE_STORAGE_PREFIX = "device-";

export function buildDeviceStorageKey(deviceId: string): string {
  const trimmed = deviceId.trim();
  return `${DEVICE_STORAGE_PREFIX}${trimmed}`;
}

export function resolveLlmUsageIdentityFromAccount(
  account: QuickerAccountSnapshot,
): LlmUsageIdentity {
  const userId = account.userId?.trim();
  if (account.loggedIn && userId) {
    return {
      kind: "quicker",
      id: userId,
      storageKey: userId,
    };
  }

  const deviceId = getOrCreateDeviceFingerprint();
  return {
    kind: "device",
    id: deviceId,
    storageKey: buildDeviceStorageKey(deviceId),
  };
}

export async function resolveLlmUsageIdentity(options?: {
  forceRefreshAccount?: boolean;
}): Promise<{ account: QuickerAccountSnapshot; identity: LlmUsageIdentity }> {
  const account = await fetchQuickerAccount({
    forceRefresh: options?.forceRefreshAccount,
  });
  return {
    account,
    identity: resolveLlmUsageIdentityFromAccount(account),
  };
}
