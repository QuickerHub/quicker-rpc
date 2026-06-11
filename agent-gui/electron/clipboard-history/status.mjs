import { clipboardHistoryPluginRoot } from "../quicker-agent-paths.mjs";
import {
  CLIPBOARD_HISTORY_ENABLED,
  DISABLED_MESSAGE,
} from "./constants.mjs";
import { devRuntimeDir } from "./paths-dev.mjs";
import {
  clipboardHttpPort,
  fetchClipboardRuntimeHealth,
  isClipboardInstalled,
  isClipboardRuntimeOwnedRunning,
} from "./runtime.mjs";
import { readClipboardAutoStart } from "./settings.mjs";

export async function buildClipboardPluginStatus() {
  if (!CLIPBOARD_HISTORY_ENABLED) {
    return {
      status: "disabled",
      installed: false,
      running: false,
      httpPort: 0,
      pluginDir: null,
      message: DISABLED_MESSAGE,
    };
  }

  const root = clipboardHistoryPluginRoot();
  const installed = isClipboardInstalled(root);
  const devDir = devRuntimeDir();
  let pluginDir = null;
  if (installed) {
    pluginDir = root;
  } else if (devDir) {
    pluginDir = devDir;
  }

  const port = clipboardHttpPort();
  const health = await fetchClipboardRuntimeHealth(port);
  if (health.ok && health.ready) {
    return {
      status: "running",
      installed: installed || Boolean(devDir),
      running: true,
      httpPort: port,
      pluginDir,
      message: null,
    };
  }

  if (isClipboardRuntimeOwnedRunning()) {
    return {
      status: "starting",
      installed: installed || Boolean(devDir),
      running: false,
      httpPort: port,
      pluginDir,
      message: "剪贴板 Runtime 启动中…",
    };
  }

  if (installed || devDir) {
    const message = readClipboardAutoStart()
      ? "已就绪，启动中或等待手动启动…"
      : "默认关闭。可在设置中手动启动，或开启「随应用自动启动」。";
    return {
      status: "installed",
      installed: true,
      running: false,
      httpPort: 0,
      pluginDir,
      message,
    };
  }

  return {
    status: "not_installed",
    installed: false,
    running: false,
    httpPort: 0,
    pluginDir,
    message:
      "剪贴板插件未安装。开发模式请设置 AGENT_GUI_CLIPBOARD_RUNTIME=1 或构建 runtime。",
  };
}
