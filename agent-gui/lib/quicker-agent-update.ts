import { compareSemver, parseSemver } from "@/lib/semver";

export const BITIFUL_VERSION_TXT_URL =
  "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/version.txt";

export const BITIFUL_UPDATER_JSON_URL =
  "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/latest.json";

export const BITIFUL_DOWNLOAD_PREFIX =
  "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent";

/** Public OSS copy of llm-publish.config.json for runtime refresh (no reinstall). */
export const BITIFUL_LLM_PUBLISH_CONFIG_URL =
  `${BITIFUL_DOWNLOAD_PREFIX}/llm-publish.config.json`;

export type QuickerAgentUpdateInfo = {
  installedVersion: string;
  remoteVersion: string;
  downloadUrl: string;
};

export function buildQuickerAgentDownloadUrl(remoteVersion: string): string {
  const version = remoteVersion.trim();
  return `${BITIFUL_DOWNLOAD_PREFIX}/quicker-agent-${version}-x64-setup.exe`;
}

export async function fetchLatestQuickerAgentVersion(
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(BITIFUL_VERSION_TXT_URL, {
      cache: "no-store",
      signal,
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return parseSemver(text) ? text : null;
  } catch {
    return null;
  }
}

export async function checkQuickerAgentUpdate(
  installedVersion: string,
  signal?: AbortSignal,
): Promise<QuickerAgentUpdateInfo | null> {
  const installed = installedVersion.trim();
  if (!parseSemver(installed)) return null;

  const remoteVersion = await fetchLatestQuickerAgentVersion(signal);
  if (!remoteVersion || compareSemver(remoteVersion, installed) <= 0) {
    return null;
  }

  return {
    installedVersion: installed,
    remoteVersion,
    downloadUrl: buildQuickerAgentDownloadUrl(remoteVersion),
  };
}
