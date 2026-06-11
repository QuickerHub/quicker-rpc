import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";
import { isVoiceAsrFullyInstalled } from "./install.mjs";
import { devRuntimeDir } from "./paths-dev.mjs";
import {
  fetchVoiceRuntimeHealth,
  getStdioBridge,
  isVoiceRuntimeOwnedRunning,
  voiceRuntimeModelReady,
} from "./runtime.mjs";
import { readVoicePluginSettings, voiceWsPort } from "./settings.mjs";
import { voiceInstallInFlight } from "./state.mjs";

function modelReadyAt(root) {
  const settings = readVoicePluginSettings(root);
  const sub = settings.modelId === "lightweight" ? "paraformer-zh" : "sensevoice";
  return existsSync(join(root, "models", sub));
}

async function wsStatusFromChild(fullyInstalled, pluginDir, port) {
  if (!isVoiceRuntimeOwnedRunning()) return null;
  const health = await fetchVoiceRuntimeHealth(port);
  if (voiceRuntimeModelReady(health)) {
    return {
      status: fullyInstalled ? "running" : "starting",
      installed: fullyInstalled,
      running: fullyInstalled,
      wsPort: port,
      pluginDir,
      message: null,
    };
  }
  return {
    status: "starting",
    installed: fullyInstalled,
    running: false,
    wsPort: port,
    pluginDir,
    message: "Runtime 启动中…",
  };
}

export async function buildVoicePluginStatus() {
  if (voiceInstallInFlight()) {
    return {
      status: "downloading",
      installed: false,
      running: false,
      wsPort: 0,
      pluginDir: voicePluginRoot(),
      message: "正在下载并安装语音插件…",
    };
  }

  const root = voicePluginRoot();
  const fullyInstalled = isVoiceAsrFullyInstalled(root);
  const devDir = devRuntimeDir();
  let pluginDir = null;
  if (fullyInstalled) {
    pluginDir = root;
  } else if (devDir) {
    pluginDir = devDir;
  } else if (existsSync(join(root, "manifest.json"))) {
    pluginDir = root;
  }

  const port = voiceWsPort(root);
  const childStatus = await wsStatusFromChild(fullyInstalled, pluginDir, port);
  if (childStatus) return childStatus;

  const bridge = getStdioBridge();
  if (bridge?.isReady() && bridge.modelLoaded()) {
    return {
      status: fullyInstalled ? "running" : "starting",
      installed: fullyInstalled,
      running: fullyInstalled,
      wsPort: port,
      pluginDir,
      message: null,
    };
  }

  if (fullyInstalled) {
    return {
      status: "installed",
      installed: true,
      running: false,
      wsPort: 0,
      pluginDir,
      message: "已安装，点击「启动 Runtime」或设置页启动",
    };
  }

  if (devDir) {
    return {
      status: "installed",
      installed: true,
      running: false,
      wsPort: 0,
      pluginDir: devDir,
      message: "开发模式：仓库 voice-asr-runtime 可用，可启动 Runtime（需 uv）",
    };
  }

  const hasPartial =
    existsSync(join(root, "manifest.json"))
    || existsSync(join(root, "runtime", "quicker-voice-runtime.exe"))
    || modelReadyAt(root);

  return {
    status: "not_installed",
    installed: false,
    running: false,
    wsPort: 0,
    pluginDir,
    message: hasPartial
      ? "语音组件未完整安装，请点击「安装」继续。"
      : "未安装。点击下方「安装」，将自动下载并配置语音服务与识别模型（约 240 MB，仅需一次）。",
  };
}

export function startingStatusDto(base) {
  if (base.installed && !base.running) {
    return {
      ...base,
      status: "starting",
      running: false,
      wsPort: voiceWsPort(),
      message: "Runtime 启动中…",
    };
  }
  return base;
}
