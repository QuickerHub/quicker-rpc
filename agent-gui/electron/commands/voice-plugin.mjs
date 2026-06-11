import {
  isVoiceAsrFullyInstalled,
  redownloadVoiceModel,
  runVoicePluginInstall,
  voiceModelInstallState,
} from "../voice-plugin/install.mjs";
import {
  buildVoicePluginStatus,
  startingStatusDto,
} from "../voice-plugin/status.mjs";
import {
  fetchVoiceRuntimeHealth,
  getStdioBridge,
  startVoiceRuntime,
  stopVoiceRuntime,
  toPcmBuffer,
} from "../voice-plugin/runtime.mjs";
import {
  readVoicePluginSettings,
  voiceWsPort,
  writeVoicePluginSettings,
} from "../voice-plugin/settings.mjs";
import {
  endVoiceRuntimeStart,
  tryBeginVoiceRuntimeStart,
  voiceInstallInFlight,
} from "../voice-plugin/state.mjs";

/**
 * @param {{
 *   getPluginCtx: () => { resourcesRoot: string, app: import('electron').App },
 *   isDev: boolean,
 * }} deps
 */
export function createVoicePluginCommands(deps) {
  const installDeps = () => ({ getPluginCtx: deps.getPluginCtx, isDev: deps.isDev });

  return {
    async voice_plugin_status() {
      return buildVoicePluginStatus();
    },
    async voice_runtime_health() {
      return fetchVoiceRuntimeHealth(voiceWsPort());
    },
    async voice_plugin_install() {
      if (!voiceInstallInFlight() && !isVoiceAsrFullyInstalled()) {
        setImmediate(() => {
          runVoicePluginInstall(installDeps())
            .then(() => startVoiceRuntime().catch((err) => {
              console.error("[voice-plugin] post-install start failed:", err);
            }))
            .catch((err) => {
              console.error("[voice-plugin] background install failed:", err);
            });
        });
      } else if (isVoiceAsrFullyInstalled()) {
        setImmediate(() => {
          startVoiceRuntime().catch((err) => {
            console.error("[voice-plugin] background start failed:", err);
          });
        });
      }
      return buildVoicePluginStatus();
    },
    async voice_plugin_start_runtime() {
      const current = await buildVoicePluginStatus();
      if (
        current.running
        || current.status === "starting"
        || current.status === "downloading"
        || !current.installed
      ) {
        return current;
      }
      if (!tryBeginVoiceRuntimeStart()) {
        return startingStatusDto(current);
      }
      setImmediate(() => {
        startVoiceRuntime()
          .catch((err) => console.error("[voice-plugin] start failed:", err))
          .finally(() => endVoiceRuntimeStart());
      });
      return startingStatusDto(await buildVoicePluginStatus());
    },
    async voice_plugin_stop_runtime() {
      stopVoiceRuntime();
      const dto = await buildVoicePluginStatus();
      if (dto.status === "running" || dto.status === "starting") {
        return {
          ...dto,
          status: "stopped",
          running: false,
          message: "已停止语音 Runtime",
        };
      }
      return dto;
    },
    async voice_plugin_redownload_model(args) {
      const modelId = String(args?.modelId ?? "standard");
      const force = args?.force !== false;
      await redownloadVoiceModel(installDeps(), modelId, force);
      return null;
    },
    voice_plugin_model_install_state() {
      return voiceModelInstallState();
    },
    voice_plugin_read_settings() {
      return readVoicePluginSettings();
    },
    async voice_plugin_write_settings(args) {
      const settings = writeVoicePluginSettings(args?.settings ?? {});
      const status = await buildVoicePluginStatus();
      if (status.running) {
        stopVoiceRuntime();
        await startVoiceRuntime();
      }
      return settings;
    },
    async voice_ipc_session_start(args) {
      const bridge = getStdioBridge();
      if (!bridge) {
        throw new Error("语音 IPC 需要 stdio 传输；当前 Runtime 使用 WebSocket 模式");
      }
      await bridge.sessionStart(
        String(args?.sessionId ?? ""),
        String(args?.language ?? "zh-CN"),
        args?.streaming === true,
      );
      return null;
    },
    async voice_ipc_session_send_audio(args) {
      const bridge = getStdioBridge();
      if (!bridge) {
        throw new Error("语音 IPC 需要 stdio 传输；当前 Runtime 使用 WebSocket 模式");
      }
      await bridge.sessionSendAudio(toPcmBuffer(args?.pcm));
      return null;
    },
    async voice_ipc_session_end(args) {
      const bridge = getStdioBridge();
      if (!bridge) {
        throw new Error("语音 IPC 需要 stdio 传输；当前 Runtime 使用 WebSocket 模式");
      }
      return bridge.sessionEnd(String(args?.sessionId ?? ""));
    },
    async voice_ipc_session_cancel(args) {
      const bridge = getStdioBridge();
      if (!bridge) {
        throw new Error("语音 IPC 需要 stdio 传输；当前 Runtime 使用 WebSocket 模式");
      }
      await bridge.sessionCancel(String(args?.sessionId ?? ""));
      return null;
    },
  };
}
