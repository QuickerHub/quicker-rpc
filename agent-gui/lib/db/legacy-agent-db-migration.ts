import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  QUICKER_AGENT_DIRNAME,
  resolveQuickerAgentAppDataDirectory,
  resolveQuickerAgentInstallDirectory,
} from "@/lib/quicker-agent-paths";
import { AGENT_DB_FILENAME } from "@/lib/db/client";

const CHAT_DB_LEGACY_FILENAME = "chats.db";

function copySqliteBundle(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${src}${suffix}`;
    if (existsSync(sidecar)) {
      copyFileSync(sidecar, `${dest}${suffix}`);
    }
  }
}

/** Copy legacy chats.db (install or old app-data layout) into agent.db when missing. */
export function runLegacyAgentDatabaseFileMigration(agentDbPath: string): void {
  if (existsSync(agentDbPath)) return;

  const appData = resolveQuickerAgentAppDataDirectory();
  const installRoot = resolveQuickerAgentInstallDirectory();
  const candidates = [
    join(appData, "local", CHAT_DB_LEGACY_FILENAME),
    join(appData, CHAT_DB_LEGACY_FILENAME),
    join(installRoot, "local", CHAT_DB_LEGACY_FILENAME),
    join(installRoot, "local", AGENT_DB_FILENAME),
    join(installRoot, CHAT_DB_LEGACY_FILENAME),
  ];

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) {
      const legacyAppData = join(local, QUICKER_AGENT_DIRNAME);
      candidates.push(
        join(legacyAppData, "local", CHAT_DB_LEGACY_FILENAME),
        join(legacyAppData, "local", AGENT_DB_FILENAME),
      );
    }
  }

  for (const src of candidates) {
    if (!existsSync(src)) continue;
    copySqliteBundle(src, agentDbPath);
    return;
  }
}
