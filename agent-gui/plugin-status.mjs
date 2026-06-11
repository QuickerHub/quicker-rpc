import { CLIPBOARD_HISTORY_ENABLED, DISABLED_MESSAGE } from "../clipboard-history/constants.mjs";
import { buildClipboardPluginStatus } from "../clipboard-history/status.mjs";
import { hostVersion } from "./host-version.mjs";
import { hostSatisfiesMinVersion } from "./compat.mjs";
import {
  listKnownPluginIds,
  resolveRegistry,
  resolvePluginChannelEntry,
} from "./registry.mjs";
import {
  isVoiceAsrInstalled,
  needsRuntimeUpdate,
  readInstalledRuntimeVersion,
} from "./voice-install.mjs";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";
import {
  fetchVoiceRuntimeHealth,
  isVoiceRuntimeRunning,
} from "../voice-plugin/runtime.mjs";
import { voiceWsPort } from "../voice-plugin/settings.mjs";
import { refreshVoiceChannelCache, resolveVoiceChannel } from "./channel.mjs";

async function voiceDisplayName(resourcesRoot) {
  const registry = await resolveRegistry({ resourcesRoot, forceRefresh: false });
  return registry.plugins?.["voice-asr"]?.displayName ?? "本地语音输入";
}

async function buildVoicePluginStatus(ctx, forceRefreshChannel = false) {
  const { resourcesRoot, app } = ctx;
  const root = voicePluginRoot();
  const installed = isVoiceAsrInstalled(root);
  const installedVersion = readInstalledRuntimeVersion(root);

  let channel = null;
  try {
    channel = forceRefreshChannel
      ? await refreshVoiceChannelCache(ctx)
      : await resolveVoiceChannel({ ...ctx, forceRefresh: false });
  } catch {
    channel = null;
  }
  const latestVersion = channel?.runtimeVersion?.trim() || null;

  let hostCompatible = true;
  try {
    const entry = await resolvePluginChannelEntry(resourcesRoot, "voice-asr");
    if (entry.minHostVersion) {
      hostCompatible = hostSatisfiesMinVersion(
        hostVersion(resourcesRoot, app),
        entry.minHostVersion,
      );
    }
  } catch {
    hostCompatible = true;
  }

  const updateAvailable =
    installed && hostCompatible && (await needsRuntimeUpdate(ctx, root));

  const port = voiceWsPort();
  const running = installed ? await isVoiceRuntimeRunning(port) : false;
  const health = running ? await fetchVoiceRuntimeHealth(port) : null;

  let message = null;
  if (!hostCompatible) {
    message = `请升级 QuickerAgent（当前 ${hostVersion(resourcesRoot, app)}）以安装最新语音 Runtime`;
  } else if (updateAvailable) {
    message = `有可用更新：${installedVersion ?? "未知"} → ${latestVersion ?? "未知"}`;
  } else if (!installed) {
    message =
      "未安装。点击下方「安装」，将自动下载并配置语音服务与识别模型（约 240 MB，仅需一次）。";
  } else if (running && health && !health.ready) {
    message = "Runtime 启动中…";
  }

  return {
    pluginId: "voice-asr",
    displayName: await voiceDisplayName(resourcesRoot),
    installed,
    running,
    installedVersion,
    latestVersion,
    updateAvailable,
    hostCompatible,
    message,
  };
}

async function buildClipboardPluginRegistryStatus() {
  const host = await buildClipboardPluginStatus();
  if (!CLIPBOARD_HISTORY_ENABLED) {
    return {
      pluginId: "clipboard-history",
      displayName: "剪贴板历史",
      installed: false,
      running: false,
      installedVersion: null,
      latestVersion: null,
      updateAvailable: false,
      hostCompatible: true,
      message: DISABLED_MESSAGE,
    };
  }
  return {
    pluginId: "clipboard-history",
    displayName: "剪贴板历史",
    installed: host.installed,
    running: host.running,
    installedVersion: null,
    latestVersion: null,
    updateAvailable: false,
    hostCompatible: true,
    message: host.message,
  };
}

/**
 * @param {{ resourcesRoot: string, app: import('electron').App }} ctx
 */
export async function buildPluginStatus(ctx, pluginId, forceRefreshChannel = false) {
  if (pluginId === "voice-asr") {
    return buildVoicePluginStatus(ctx, forceRefreshChannel);
  }
  if (pluginId === "clipboard-history") {
    return buildClipboardPluginRegistryStatus();
  }
  throw new Error(`unknown plugin id: ${pluginId}`);
}

export async function pluginList(ctx) {
  const ids = await listKnownPluginIds(ctx.resourcesRoot);
  const items = [];
  for (const pluginId of ids) {
    items.push(await buildPluginStatus(ctx, pluginId, false));
  }
  if (!items.some((item) => item.pluginId === "clipboard-history")) {
    items.push(await buildClipboardPluginRegistryStatus());
  }
  return items;
}

export async function pluginRegistryRefresh(ctx) {
  await resolveRegistry({ ...ctx, forceRefresh: true });
  await refreshVoiceChannelCache(ctx);
}
