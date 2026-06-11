import {
  buildPluginStatus,
  pluginList,
  pluginRegistryRefresh,
} from "../plugin-runtime/plugin-status.mjs";
import { refreshVoiceChannelCache } from "../plugin-runtime/channel.mjs";
import { isVoiceAsrInstalled } from "../plugin-runtime/voice-install.mjs";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";
import { startVoiceRuntime } from "../voice-plugin/runtime.mjs";

const EVENT_ON_DEMAND_VOICE_INPUT = "onDemand:voice-input";

/**
 * @param {{ getPluginCtx: () => { resourcesRoot: string, app: import('electron').App } }} deps
 */
export function createPluginRuntimeCommands(deps) {
  return {
    async plugin_registry_refresh() {
      await pluginRegistryRefresh(deps.getPluginCtx());
      return null;
    },
    async plugin_list() {
      return pluginList(deps.getPluginCtx());
    },
    async plugin_status(args) {
      const pluginId = String(args?.pluginId ?? "");
      return buildPluginStatus(deps.getPluginCtx(), pluginId, false);
    },
    async plugin_update(args) {
      const pluginId = String(args?.pluginId ?? "");
      const ctx = deps.getPluginCtx();
      if (pluginId === "voice-asr") {
        await refreshVoiceChannelCache(ctx);
        const root = voicePluginRoot();
        if (!isVoiceAsrInstalled(root)) {
          throw new Error("语音插件尚未安装");
        }
        // Full staged upgrade is P4; refresh channel + return current status for UI.
        return buildPluginStatus(ctx, pluginId, false);
      }
      if (pluginId === "clipboard-history") {
        throw new Error("clipboard-history runtime updates are not available yet");
      }
      throw new Error(`unknown plugin id: ${pluginId}`);
    },
    async plugin_activate(args) {
      const pluginId = String(args?.pluginId ?? "");
      const event = String(args?.event ?? "");
      if (pluginId === "voice-asr" && event === EVENT_ON_DEMAND_VOICE_INPUT) {
        await refreshVoiceChannelCache(deps.getPluginCtx());
        const root = voicePluginRoot();
        if (!isVoiceAsrInstalled(root)) {
          throw new Error("语音插件尚未安装，请先在设置中安装");
        }
        await startVoiceRuntime();
        return null;
      }
      throw new Error(`unsupported activation: ${pluginId} / ${event}`);
    },
  };
}
