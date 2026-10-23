import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { AGENT_DATA_DIRECTORY_ENV } from "./agent-data-profile.mjs";
import { resolveQuickerAgentAppDataDirectory, resolveQuickerAgentInstallDirectory, resolveVoiceAsrPluginDirectory, resolveLegacyVoiceAsrPluginDirectory, resolveReleaseDefaultWorkingDirectory, resolveTauriWebviewUserDataRoot } from "./quicker-agent-paths";
import { resetPersistedDataMigrationForTests, resolveLegacyPersistedJsonPaths, resolveQuickerAgentPersistedDataDirectory } from "./quicker-agent-persisted-data";
import { runLegacyAgentDatabaseFileMigration } from "./db/legacy-agent-db-migration";
import { collectLegacyLevelDbDirectories } from "./legacy-chat-leveldb-scan.server";
import { resolveLlmSecretsPath } from "./llm-local-secrets";
import { resolveLlmConfigPath } from "./llm-config";
import { quickerAgentAppDataDir, voicePluginRoot } from "../electron/quicker-agent-paths.mjs";
import { loadConfig } from "../browser-runtime/config.mjs";

test("an explicit profile never probes or copies ambient DB/settings/plugin markers", (t) => {
  const base = resolve("..", "..", "..", ".tmp");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(join(base, "agent-profile-isolation-"));
  const profile = join(root, "dedicated profile"), ambient = join(root, "ambient");
  const appRoot = join(ambient, "app"), local = join(ambient, "local"), roaming = join(ambient, "roaming");
  const names = [AGENT_DATA_DIRECTORY_ENV, "APPDATA", "LOCALAPPDATA", "XDG_DATA_HOME", "AGENT_GUI_ROOT", "QUICKER_BROWSER_USER_DATA_DIR"];
  const previous = names.map((name) => [name, process.env[name]] as const);
  Object.assign(process.env, { [AGENT_DATA_DIRECTORY_ENV]: profile, APPDATA: roaming, LOCALAPPDATA: local, XDG_DATA_HOME: join(ambient, "xdg"), AGENT_GUI_ROOT: appRoot });
  delete process.env.QUICKER_BROWSER_USER_DATA_DIR;
  const legacyRoots = [join(roaming, "QuickerAgent"), join(local, "QuickerAgent", "local"), join(appRoot, ".local")];
  for (const legacy of legacyRoots) {
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(join(legacy, "llm-secrets.json"), '{"marker":"ambient-only"}');
    fs.writeFileSync(join(legacy, "chats.db"), "ambient-only-db");
  }
  const voice = join(local, "QuickerAgent", "plugins", "voice-asr");
  fs.mkdirSync(voice, { recursive: true });
  fs.writeFileSync(join(voice, "manifest.json"), '{"marker":"ambient-only"}');
  t.after(() => {
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    resetPersistedDataMigrationForTests();
    assert.ok(resolve(root).startsWith(resolve(base) + sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const allowed = (path: unknown) => {
    assert.equal(typeof path, "string");
    const suffix = relative(profile, resolve(path as string));
    assert.ok(suffix === "" || !isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`), "profile attempted ambient file access");
  };
  const spies = ["existsSync", "readFileSync", "readdirSync", "statSync", "cpSync", "copyFileSync"].map((name) => {
    const key = name as keyof typeof fs;
    const original = fs[key] as (...args: unknown[]) => unknown;
    return t.mock.method(fs, key, ((...args: unknown[]) => {
      allowed(args[0]);
      if (name === "cpSync" || name === "copyFileSync") allowed(args[1]);
      return Reflect.apply(original, fs, args);
    }) as never);
  });
  syncBuiltinESMExports();
  try {
    resetPersistedDataMigrationForTests();
    assert.equal(resolveQuickerAgentPersistedDataDirectory(), profile);
    assert.equal(resolveQuickerAgentAppDataDirectory(), profile);
    assert.equal(quickerAgentAppDataDir(), profile);
    assert.equal(resolveLlmSecretsPath(), join(profile, "llm-secrets.json"));
    assert.deepEqual(resolveLegacyPersistedJsonPaths("llm-secrets.json"), [join(profile, "llm-secrets.json")]);
    assert.equal(resolveVoiceAsrPluginDirectory(), join(profile, "plugins", "voice-asr"));
    assert.equal(resolveLegacyVoiceAsrPluginDirectory(), join(profile, "plugins", "voice-asr"));
    assert.equal(voicePluginRoot(), join(profile, "plugins", "voice-asr"));
    assert.equal(resolveReleaseDefaultWorkingDirectory(), join(profile, "workspace"));
    assert.equal(resolveTauriWebviewUserDataRoot(), join(profile, "webview"));
    assert.equal(loadConfig([]).userDataDir, join(profile, "browser-profile"));
    assert.deepEqual(collectLegacyLevelDbDirectories(), []);
    runLegacyAgentDatabaseFileMigration(join(profile, "agent.db"));
    assert.equal(fs.existsSync(join(profile, "agent.db")), false);
    assert.deepEqual(fs.readdirSync(profile), []);
    assert.equal(resolveLlmConfigPath(), `${appRoot}/llm-config.json`, "bundled resource configuration is not moved into user data");
    if (process.platform === "win32") assert.equal(resolveQuickerAgentInstallDirectory(), join(local, "QuickerAgent"));
  } finally {
    for (const spy of spies) spy.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(fs.readFileSync(join(legacyRoots[0], "llm-secrets.json"), "utf8"), '{"marker":"ambient-only"}');
  fs.writeFileSync(join(profile, "keep.txt"), "existing profile content");
  resolveQuickerAgentPersistedDataDirectory();
  assert.equal(fs.readFileSync(join(profile, "keep.txt"), "utf8"), "existing profile content", "selecting a profile never clears its files");
});
