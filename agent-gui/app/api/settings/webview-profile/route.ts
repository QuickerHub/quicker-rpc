import { CHAT_STORAGE_KEY } from "@/lib/chat-store";
import {
  QUICKER_AGENT_TAURI_IDENTIFIER,
  resolveQuickerAgentAppDataDirectory,
  resolveTauriWebviewDefaultProfileDir,
  resolveTauriWebviewLocalStorageLevelDbDir,
  resolveTauriWebviewUserDataRoot,
} from "@/lib/quicker-agent-paths";
import { resolveQuickerAgentPersistedDataDirectory } from "@/lib/quicker-agent-persisted-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    identifier: QUICKER_AGENT_TAURI_IDENTIFIER,
    userDataRoot: resolveTauriWebviewUserDataRoot(),
    defaultProfileDir: resolveTauriWebviewDefaultProfileDir(),
    localStorageLeveldbDir: resolveTauriWebviewLocalStorageLevelDbDir(),
    chatStorageKey: CHAT_STORAGE_KEY,
    appDataRoot: resolveQuickerAgentAppDataDirectory(),
    persistedServerDataDir: resolveQuickerAgentPersistedDataDirectory(),
    survivesInstallUpdate: true,
    devBrowserNote:
      "pnpm dev in a normal browser uses that browser's profile for http://127.0.0.1:3000, not the Tauri paths below.",
  });
}
