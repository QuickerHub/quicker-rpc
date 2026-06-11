import { scanLegacyChatLevelDbStores } from "../legacy-chat/scan.mjs";

export function createLegacyChatCommands() {
  return {
    legacy_chat_store_scan() {
      return scanLegacyChatLevelDbStores();
    },
  };
}
