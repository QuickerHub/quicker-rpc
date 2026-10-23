import { homedir } from "node:os";
import { isAbsolute, parse, posix, resolve, win32 } from "node:path";

export const AGENT_DATA_DIRECTORY_ENV = "QUICKER_AGENT_DATA_DIR";
export const AGENT_DATA_DIRECTORY_NAME = "QuickerAgent";
const PROFILE_KEY = Symbol.for("quicker.agent.data-profile");
const configuredProfile = () => Reflect.get(globalThis, PROFILE_KEY);

/** Validate a dedicated profile path without reading, creating or migrating it. */
export function normalizeAgentDataDirectory(value) {
  const raw = value.trim();
  if (!raw || !isAbsolute(raw) || (process.platform === "win32" && /^[\\/]$/.test(parse(raw).root))) {
    throw new Error("Agent data directory must be an absolute path");
  }
  return resolve(raw);
}

/** The historical OS default; install/resource fallbacks must not use a profile override. */
export function resolveDefaultAgentDataDirectory(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const { join } = platform === "win32" ? win32 : posix;
  if (platform === "win32") {
    const roaming = env.APPDATA?.trim();
    if (roaming) return join(roaming, AGENT_DATA_DIRECTORY_NAME);
    const local = env.LOCALAPPDATA?.trim();
    if (local) return join(local, AGENT_DATA_DIRECTORY_NAME);
  }
  if (platform === "darwin") return join(home, "Library", "Application Support", AGENT_DATA_DIRECTORY_NAME);
  const xdg = env.XDG_DATA_HOME?.trim();
  return join(xdg || join(home, ".local", "share"), AGENT_DATA_DIRECTORY_NAME);
}

export function resolveAgentDataProfile() {
  const configured = configuredProfile();
  if (configured) return configured;
  const raw = process.env[AGENT_DATA_DIRECTORY_ENV]?.trim();
  return raw
    ? { directory: normalizeAgentDataDirectory(raw), explicit: true }
    : { directory: resolveDefaultAgentDataDirectory(), explicit: false };
}

/** Call once before loading a service runtime. This selects a profile, never clears or imports it. */
export function configureAgentDataProfile(dataDir) {
  let configured = configuredProfile();
  const selected = dataDir === undefined
    ? resolveAgentDataProfile()
    : { directory: normalizeAgentDataDirectory(dataDir), explicit: true };
  if (configured && (configured.directory !== selected.directory || configured.explicit !== selected.explicit)) {
    throw new Error("Agent data profile is already configured; restart to select another directory");
  }
  if (!configured) {
    configured = Object.freeze(selected);
    Reflect.set(globalThis, PROFILE_KEY, configured);
  }
  if (configured.explicit) process.env[AGENT_DATA_DIRECTORY_ENV] = configured.directory;
  return configured;
}
