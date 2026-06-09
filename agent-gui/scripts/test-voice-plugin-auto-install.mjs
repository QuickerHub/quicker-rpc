#!/usr/bin/env node
/**
 * Diagnose and test voice-plugin auto-install trigger paths.
 *
 * Usage:
 *   node scripts/test-voice-plugin-auto-install.mjs status
 *   node scripts/test-voice-plugin-auto-install.mjs trigger-check
 *   node scripts/test-voice-plugin-auto-install.mjs probe-urls
 *   node scripts/test-voice-plugin-auto-install.mjs reset --yes
 *   node scripts/test-voice-plugin-auto-install.mjs print-console
 *
 * Notes:
 * - Tauri install commands only work inside QuickerAgent (Tauri webview), not plain browser dev.
 * - `pwsh ./dev.ps1` = browser shell → auto-install via Tauri never fires.
 * - `pnpm tauri:dev` = debug build → startup background install skipped; use voice button or print-console.
 * - Release QuickerAgent.exe → startup background install runs when plugin is missing.
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = join(scriptDir, "..");
const repoRoot = join(agentGuiRoot, "..");
const channelPath = join(
  agentGuiRoot,
  "src-tauri/resources/voice-plugin-channel.json",
);
const modelIdentityPath = join(
  agentGuiRoot,
  "src-tauri/resources/voice-sensevoice-model-identity.json",
);

const DEFAULT_VOICE_PORT = 6016;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveUserDocumentsDirectory() {
  const home = process.env.USERPROFILE?.trim() || homedir();
  const oneDrive = process.env.OneDrive?.trim();
  if (process.platform === "win32") {
    const docs = join(home, "Documents");
    if (existsSync(docs)) return docs;
    if (oneDrive && existsSync(join(oneDrive, "Documents"))) {
      return join(oneDrive, "Documents");
    }
    return docs;
  }
  const xdg = process.env.XDG_DOCUMENTS_DIR?.trim();
  if (xdg && existsSync(xdg)) return xdg;
  return join(homedir(), "Documents");
}

function resolveQuickerAgentAppDataDirectory() {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) return join(local, "QuickerAgent");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "QuickerAgent");
  }
  const xdgData = process.env.XDG_DATA_HOME?.trim();
  if (xdgData) return join(xdgData, "QuickerAgent");
  return join(homedir(), ".local", "share", "QuickerAgent");
}

function pluginRoots() {
  const primary = join(
    resolveQuickerAgentAppDataDirectory(),
    "plugins",
    "voice-asr",
  );
  const legacy = join(
    resolveUserDocumentsDirectory(),
    "QuickerAgent",
    "plugins",
    "voice-asr",
  );
  return { primary, legacy };
}

function resolveActivePluginRoot() {
  const { primary, legacy } = pluginRoots();
  if (existsSync(join(primary, "manifest.json"))) return primary;
  if (existsSync(join(legacy, "manifest.json"))) return legacy;
  return primary;
}

function sha256Hint(path) {
  if (!existsSync(path)) return null;
  try {
    const size = statSync(path).size;
    return { exists: true, bytes: size };
  } catch {
    return { exists: false };
  }
}

function inspectPluginRoot(root) {
  const manifest = join(root, "manifest.json");
  const runtimeExe = join(root, "runtime/quicker-voice-runtime.exe");
  const modelDir = join(root, "models/sensevoice");
  const settings = join(root, "settings.json");
  const runtimeVersion = join(root, "runtime-version.txt");

  let modelFiles = {};
  try {
    const identity = readJson(modelIdentityPath);
    for (const name of Object.keys(identity.files ?? {})) {
      modelFiles[name] = sha256Hint(join(modelDir, name));
    }
  } catch {
    modelFiles = { _error: "could not read model identity json" };
  }

  const runtimeReady = existsSync(runtimeExe);
  const modelReady = Object.values(modelFiles).every(
    (entry) => entry && entry.exists,
  );
  const installed =
    existsSync(manifest) && runtimeReady && modelReady;

  return {
    root,
    manifest: existsSync(manifest),
    runtimeExe: sha256Hint(runtimeExe),
    modelDir: existsSync(modelDir),
    modelFiles,
    settings: existsSync(settings),
    runtimeVersion: existsSync(runtimeVersion)
      ? readFileSync(runtimeVersion, "utf8").trim()
      : null,
    runtimeReady,
    modelReady,
    installed,
  };
}

function resolveVoicePort() {
  const raw =
    process.env.QUICKER_VOICE_PORT?.trim()
    ?? process.env.AGENT_GUI_VOICE_PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_VOICE_PORT;
}

async function fetchVoiceHealth(port = resolveVoicePort()) {
  const base = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, base, status: res.status };
    }
    const body = await res.json();
    return { ok: true, base, body };
  } catch (err) {
    return {
      ok: false,
      base,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function detectDevContext() {
  const devServerPath = join(agentGuiRoot, ".local/dev-server.json");
  const hasDevServer = existsSync(devServerPath);
  let devUrl = null;
  if (hasDevServer) {
    try {
      devUrl = readJson(devServerPath).url ?? null;
    } catch {
      devUrl = null;
    }
  }

  const voiceRuntimeState = join(agentGuiRoot, ".runtime/voice-runtime.json");
  const devRuntimeDir = join(repoRoot, "voice-asr-runtime");
  const packagedRuntime = join(
    repoRoot,
    "voice-asr-runtime/dist/quicker-voice-runtime/quicker-voice-runtime.exe",
  );
  const packagedModel = join(repoRoot, "voice-asr-runtime/models/sensevoice");

  return {
    agentGuiDevRunning: hasDevServer,
    devUrl,
    voiceRuntimeStateTracked: existsSync(voiceRuntimeState),
    devRuntimeRepo: existsSync(join(devRuntimeDir, "pyproject.toml")),
    packagedRuntimeDist: existsSync(packagedRuntime),
    packagedModelDir: existsSync(join(packagedModel, "tokens.txt")),
  };
}

function detectQuickerAgentProcess() {
  if (process.platform !== "win32") {
    return { running: null, note: "process scan only implemented on Windows" };
  }
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'QuickerAgent\\.exe|quicker-agent\\.exe|quicker-rpc-agent-gui\\.exe\' -or ($_.CommandLine -match \'tauri dev\' -and $_.CommandLine -match \'agent-gui\') } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"',
      { encoding: "utf8", windowsHide: true, timeout: 10_000 },
    ).trim();
    if (!out) return { running: false, processes: [] };
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return { running: list.length > 0, processes: list };
  } catch (err) {
    return {
      running: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function evaluateTriggerPaths(ctx) {
  const { primary, legacy } = pluginRoots();
  const active = resolveActivePluginRoot();
  const inspect = inspectPluginRoot(active);
  const health = ctx.voiceHealth;
  const dev = ctx.devContext;
  const tauriProc = ctx.quickerAgentProcess;

  const browserDev = dev.agentGuiDevRunning && !devUrlLooksLikeTauri(dev.devUrl);
  const tauriLikely = tauriProc.running === true;

  const triggers = [];

  triggers.push({
    id: "startup-background-release",
    description: "QuickerAgent 启动时后台自动安装（仅 Release 构建）",
    wouldRun:
      tauriLikely
      && !inspect.installed
      && !browserDev,
    blockedBy: [
      !tauriLikely && "未检测到 QuickerAgent/Tauri 进程",
      browserDev && "当前是浏览器 dev（pnpm dev），不是 Tauri 壳",
      inspect.installed && "插件目录已完整安装",
      "Debug 构建会跳过此路径（cfg!(debug_assertions)）",
    ].filter(Boolean),
  });

  triggers.push({
    id: "voice-button-ensureVoicePluginReady",
    description: "点击麦克风 → ensureVoicePluginReady → voice_plugin_install",
    wouldRun:
      !browserDev
      && tauriLikely
      && !inspect.installed,
    blockedBy: [
      browserDev && "浏览器 dev 下 isTauriShell()=false，ensureVoicePluginReady 直接返回 false",
      !tauriLikely && "未检测到 QuickerAgent.exe / tauri dev 进程",
      inspect.installed && !health?.body?.ready && "已安装但未 running，会走 start_runtime 而非 install",
      inspect.installed && health?.body?.ready && "已 running，无需 install",
    ].filter(Boolean),
  });

  triggers.push({
    id: "settings-manual-install",
    description: "设置页「一键安装」→ tauriVoicePluginInstall",
    wouldRun: !browserDev && tauriLikely && !inspect.installed,
    blockedBy: [
      browserDev && "浏览器 dev 无法 invoke Tauri 命令",
      !tauriLikely && "需要 QuickerAgent.exe 或 pnpm tauri:dev",
      inspect.installed && "已安装，按钮应显示启动/停止",
    ].filter(Boolean),
  });

  triggers.push({
    id: "dev-start-mjs-voice-runtime",
    description: "start.mjs --dev 自动 uv 启动 voice-asr-runtime（非 Tauri 安装）",
    wouldRun:
      dev.agentGuiDevRunning
      && dev.devRuntimeRepo
      && process.env.AGENT_GUI_SKIP_VOICE_RUNTIME !== "1",
    blockedBy: [
      !dev.agentGuiDevRunning && "agent-gui dev 未运行",
      !dev.devRuntimeRepo && "仓库缺少 voice-asr-runtime",
      process.env.AGENT_GUI_SKIP_VOICE_RUNTIME === "1"
        && "AGENT_GUI_SKIP_VOICE_RUNTIME=1",
    ].filter(Boolean),
  });

  return {
    activePluginRoot: active,
    primary,
    legacy,
    inspect,
    browserDev,
    tauriLikely,
    triggers,
  };
}

function devUrlLooksLikeTauri(url) {
  if (!url) return false;
  return !/^https?:\/\/127\.0\.0\.1:\d+/.test(url);
}

async function probeDownloadUrls() {
  const channel = readJson(channelPath);
  const entries = [
    ["runtime mirror", channel.runtimeZipMirrorUrl],
    ["runtime primary", channel.runtimeZipUrl],
    ["model mirror", channel.modelZipMirrorUrl],
    ["model primary", channel.modelZipUrl],
  ].filter(([, url]) => typeof url === "string" && url.trim());

  const results = [];
  for (const [label, url] of entries) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      results.push({
        label,
        url,
        ok: res.ok,
        status: res.status,
        contentLength: res.headers.get("content-length"),
      });
    } catch (err) {
      results.push({
        label,
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { channelRuntimeVersion: channel.runtimeVersion, results };
}

function printConsoleSnippet() {
  const snippet = `
// Paste in QuickerAgent DevTools console (Tauri shell only: pnpm tauri:dev or Release exe)
(async () => {
  const inTauri = "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
  if (!inTauri) {
    console.error("Not in Tauri — open QuickerAgent via pnpm tauri:dev or the installed exe.");
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const unlisten = await listen("voice-plugin-install-progress", (e) => {
    console.log("[install]", e.payload);
  });

  console.log("status before:", await invoke("voice_plugin_status"));

  try {
    const result = await invoke("voice_plugin_install");
    console.log("install result:", result);
  } catch (err) {
    console.error("install failed:", err);
  } finally {
    unlisten();
    console.log("status after:", await invoke("voice_plugin_status"));
  }
})();
`.trim();

  console.log(snippet);
  console.log("\n---");
  console.log(
    "This mirrors ensureVoicePluginReady() when status is not_installed.",
  );
}

function resetPluginInstall(yes) {
  if (!yes) {
    console.error("Refusing reset without --yes");
    process.exit(2);
  }

  const { primary, legacy } = pluginRoots();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backups = [];

  for (const root of [primary, legacy]) {
    if (!existsSync(root)) continue;
    const backup = `${root}.bak-${stamp}`;
    renameSync(root, backup);
    backups.push({ from: root, to: backup });
  }

  mkdirSync(primary, { recursive: true });
  return { backups, nextInstallRoot: primary };
}

async function cmdStatus() {
  const { primary, legacy } = pluginRoots();
  const active = resolveActivePluginRoot();
  const inspect = inspectPluginRoot(active);
  const dev = detectDevContext();
  const voiceHealth = await fetchVoiceHealth();
  const quickerAgentProcess = detectQuickerAgentProcess();
  const trigger = evaluateTriggerPaths({
    voiceHealth,
    devContext: dev,
    quickerAgentProcess,
  });

  const report = {
    timestamp: new Date().toISOString(),
    pluginRoots: { primary, legacy, active },
    installState: inspect,
    voiceHealth,
    devContext: dev,
    quickerAgentProcess,
    triggerEvaluation: trigger,
    hints: [
      browserDevHint(trigger.browserDev),
      !trigger.inspect.installed
        && !trigger.tauriLikely
        && "自动安装需要 Tauri 壳：pnpm --dir agent-gui tauri:dev 或运行已安装的 QuickerAgent.exe",
      trigger.browserDev
        && "浏览器 dev 只会 uv 启动 voice-asr-runtime，不会下载 zip 安装包",
    ].filter(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

function browserDevHint(isBrowserDev) {
  if (!isBrowserDev) return null;
  return "检测到浏览器 dev（pwsh ./dev.ps1）— Tauri voice_plugin_install 不可用";
}

async function cmdTriggerCheck() {
  const report = await cmdStatus();
  const anyWouldRun = report.triggerEvaluation.triggers.some((t) => t.wouldRun);
  console.error("\n=== trigger summary ===");
  for (const t of report.triggerEvaluation.triggers) {
    const mark = t.wouldRun ? "WOULD RUN" : "blocked";
    console.error(`[${mark}] ${t.id}: ${t.description}`);
    if (t.blockedBy.length > 0) {
      for (const reason of t.blockedBy) {
        console.error(`  - ${reason}`);
      }
    }
  }
  process.exit(anyWouldRun ? 0 : 1);
}

async function main() {
  const cmd = process.argv[2] ?? "status";
  const yes = process.argv.includes("--yes");

  switch (cmd) {
    case "status":
      await cmdStatus();
      break;
    case "trigger-check":
      await cmdTriggerCheck();
      break;
    case "probe-urls": {
      const result = await probeDownloadUrls();
      console.log(JSON.stringify(result, null, 2));
      const allOk = result.results.every((r) => r.ok);
      process.exit(allOk ? 0 : 1);
      break;
    }
    case "reset": {
      const result = resetPluginInstall(yes);
      console.log(JSON.stringify(result, null, 2));
      console.error("\nNext: pnpm --dir agent-gui tauri:dev → DevTools → run print-console snippet");
      break;
    }
    case "print-console":
      printConsoleSnippet();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(
        "Commands: status | trigger-check | probe-urls | reset --yes | print-console",
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
