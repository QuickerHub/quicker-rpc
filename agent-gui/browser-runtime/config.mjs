import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const RUNTIME_VERSION = "0.4.0";
export const PROTOCOL_VERSION = "quicker-browser-v1";

/**
 * @param {string[]} [argv]
 */
export function loadConfig(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const host = args.host ?? process.env.QUICKER_BROWSER_HOST?.trim() ?? "127.0.0.1";
  const port = Number(args.port ?? process.env.QUICKER_BROWSER_PORT ?? "6017");
  const headless = parseBool(
    args.headless ?? process.env.QUICKER_BROWSER_HEADLESS ?? "1",
    true,
  );
  const channel = resolveChannel(args.channel ?? process.env.QUICKER_BROWSER_CHANNEL);
  const userDataDir = resolveUserDataDir(
    args["user-data-dir"] ?? process.env.QUICKER_BROWSER_USER_DATA_DIR,
  );
  return { host, port, headless, channel, userDataDir };
}

/** @param {string | undefined} raw @param {boolean} fallback */
function parseBool(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

/** @param {string | undefined} raw */
function resolveChannel(raw) {
  const explicit = raw?.trim();
  if (explicit) return explicit.toLowerCase() === "chromium" ? null : explicit;
  if (process.platform === "win32") return "msedge";
  return null;
}

/** @param {string | undefined} override */
function resolveUserDataDir(override) {
  if (override?.trim()) return resolve(override.trim());
  const local = process.env.LOCALAPPDATA?.trim();
  if (local) return join(local, "QuickerAgent", "browser-profile");
  return join(homedir(), ".local", "share", "QuickerAgent", "browser-profile");
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string | undefined>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}
