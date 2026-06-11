import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, basename } from "node:path";
import { createInterface } from "node:readline";
import { app } from "../electron-api.mjs";
import { resolvePluginMetadataRoot } from "../paths.mjs";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";
import { resolveVoiceChannel } from "../plugin-runtime/channel.mjs";
import { emitVoiceInstallProgress } from "./events.mjs";
import { devRuntimeDir, packagedModelDir, packagedRuntimeDist } from "./paths-dev.mjs";
import {
  endVoiceRuntimeStart,
  setVoiceInstallInFlight,
  voiceInstallInFlight,
} from "./state.mjs";

const MODEL_SUBDIR = "sensevoice";
const PARAFORMER_SUBDIR = "paraformer-zh";
const PROGRESS_MARKER = "QUICKER_VOICE_PROGRESS";
const PARAFORMER_MIN_ONNX_BYTES = 20 * 1024 * 1024;
const PARAFORMER_MIN_TOKENS_BYTES = 64;

function installIsDev() {
  const exe = basename(process.execPath).toLowerCase();
  if (exe === "quickeragent.exe" || exe === "quicker-agent.exe") {
    return false;
  }
  return !app.isPackaged
    && (process.env.ELECTRON_DEV === "1" || process.argv.includes("--dev"));
}

function voiceMetadataRoot() {
  return resolvePluginMetadataRoot(app, installIsDev());
}

function readVoiceMetadataFile(name) {
  return readFileSync(join(voiceMetadataRoot(), name), "utf8");
}

function manifestJson() {
  return readVoiceMetadataFile("voice-plugin-manifest.json");
}

function sensevoiceModelIdentityJson() {
  return readVoiceMetadataFile("voice-sensevoice-model-identity.json");
}

const DEFAULT_SETTINGS_JSON =
  '{"autoStart":true,"modelId":"standard","gpuAcceleration":false,"language":"zh-CN","silentStopSeconds":0,"streamingPreview":false,"maxRecordingSeconds":120,"wsPort":6016}';

function runtimeDir(root) {
  return join(root, "runtime");
}

function modelDir(root) {
  return join(root, "models", MODEL_SUBDIR);
}

function paraformerModelDir(root) {
  return join(root, "models", PARAFORMER_SUBDIR);
}

function runtimeReady(root) {
  return existsSync(join(runtimeDir(root), "quicker-voice-runtime.exe"));
}

function sha256HexFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function verifySha256(path, expected, label) {
  const trimmed = String(expected ?? "").trim();
  if (!trimmed) return;
  const actual = await sha256HexFile(path);
  if (actual.toLowerCase() !== trimmed.toLowerCase()) {
    throw new Error(`${label}校验失败（sha256 不匹配）。请重试安装。`);
  }
}

function verifySensevoiceModelIdentity(dir) {
  const identity = JSON.parse(sensevoiceModelIdentityJson());
  for (const [name, spec] of Object.entries(identity.files)) {
    const path = join(dir, name);
    if (!existsSync(path)) {
      throw new Error(`模型文件缺失 ${name}（期望 ${identity.id}）`);
    }
    const size = statSync(path).size;
    if (size !== spec.size) {
      throw new Error(`模型 ${name} 大小不匹配（期望 ${spec.size} 字节，实际 ${size}）`);
    }
  }
  return true;
}

function modelDirReady(dir) {
  try {
    verifySensevoiceModelIdentity(dir);
    return true;
  } catch {
    return (
      existsSync(join(dir, "tokens.txt"))
      && (existsSync(join(dir, "model.int8.onnx")) || existsSync(join(dir, "model.onnx")))
    );
  }
}

function paraformerModelReady(dir) {
  const tokens = join(dir, "tokens.txt");
  const onnx = existsSync(join(dir, "model.int8.onnx"))
    ? join(dir, "model.int8.onnx")
    : existsSync(join(dir, "model.onnx"))
      ? join(dir, "model.onnx")
      : null;
  if (!onnx) return false;
  try {
    return (
      statSync(tokens).size >= PARAFORMER_MIN_TOKENS_BYTES
      && statSync(onnx).size >= PARAFORMER_MIN_ONNX_BYTES
    );
  } catch {
    return false;
  }
}

export function isVoiceAsrFullyInstalled(root = voicePluginRoot()) {
  return (
    existsSync(join(root, "manifest.json"))
    && runtimeReady(root)
    && modelDirReady(modelDir(root))
  );
}

function dirHasPartialEntries(dir, ready) {
  if (ready || !existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((name) => name && name !== ".gitkeep" && name !== "README.md");
  } catch {
    return false;
  }
}

export function voiceModelInstallState(root = voicePluginRoot()) {
  const standard = modelDirReady(modelDir(root));
  const lightweight = paraformerModelReady(paraformerModelDir(root));
  return {
    standard,
    lightweight,
    standardPartial: dirHasPartialEntries(modelDir(root), standard),
    lightweightPartial: dirHasPartialEntries(paraformerModelDir(root), lightweight),
  };
}

function writePluginMetadata(root) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "manifest.json"), manifestJson(), "utf8");
  const settingsPath = join(root, "settings.json");
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, DEFAULT_SETTINGS_JSON, "utf8");
  }
}

function writeRuntimeModelIdentity(root) {
  const dest = join(runtimeDir(root), "models", "sensevoice-model-identity.json");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, sensevoiceModelIdentityJson(), "utf8");
}

function copyDirRecursive(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dst);
    } else {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
}

async function downloadFile(phase, label, url, dest, percentStart, percentEnd) {
  emitVoiceInstallProgress(phase, percentStart, `正在下载${label}…`);
  const response = await fetch(url, { signal: AbortSignal.timeout(900_000) });
  if (!response.ok) {
    throw new Error(`下载${label}失败 (HTTP ${response.status}): ${url}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const span = percentEnd - percentStart;
  mkdirSync(dirname(dest), { recursive: true });
  const file = createWriteStream(dest);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`下载${label}失败: empty body`);
  let downloaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    file.write(value);
    downloaded += value.length;
    if (total > 0) {
      const pct = percentStart + Math.floor((downloaded * span) / total);
      emitVoiceInstallProgress(
        phase,
        Math.min(pct, percentEnd),
        `正在下载${label}… ${Math.floor(downloaded / (1024 * 1024))} / ${Math.floor(total / (1024 * 1024))} MB`,
      );
    }
  }
  await new Promise((resolve, reject) => {
    file.end(() => resolve());
    file.on("error", reject);
  });
}

async function downloadFileWithFallback(phase, label, urls, dest, percentStart, percentEnd) {
  const errors = [];
  for (let index = 0; index < urls.length; index += 1) {
    if (index > 0) {
      emitVoiceInstallProgress(phase, percentStart, `国内源不可用，正在切换备用下载${label}…`);
    }
    try {
      await downloadFile(phase, label, urls[index], dest, percentStart, percentEnd);
      return;
    } catch (err) {
      errors.push(`${urls[index]}: ${err instanceof Error ? err.message : String(err)}`);
      try {
        rmSync(dest, { force: true });
      } catch {
        // ignore
      }
    }
  }
  throw new Error(`下载${label}失败: ${errors.join(" | ")}`);
}

async function extractZip(zipPath, dest, label) {
  emitVoiceInstallProgress("extract", 0, `正在解压${label}…`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const escapedZip = zipPath.replace(/'/g, "''");
  const escapedDest = dest.replace(/'/g, "''");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`解压${label}失败 (exit ${code})`));
    });
  });
}

function downloadUrls(mirror, primary) {
  const urls = [];
  const mirrorTrimmed = String(mirror ?? "").trim();
  if (mirrorTrimmed) urls.push(mirrorTrimmed);
  urls.push(String(primary).trim());
  return urls;
}

async function installRuntimeFromLocal(src, root) {
  emitVoiceInstallProgress("runtime", 20, "正在安装语音识别服务（本地）…");
  const dest = runtimeDir(root);
  rmSync(dest, { recursive: true, force: true });
  copyDirRecursive(src, dest);
}

async function installRuntimeFromUrl(ctx, channel, root, tempDir) {
  const zipPath = join(tempDir, "runtime.zip");
  const urls = downloadUrls(channel.runtimeZipMirrorUrl, channel.runtimeZipUrl);
  await downloadFileWithFallback(
    "runtime",
    "语音识别服务",
    urls,
    zipPath,
    10,
    45,
  );
  await verifySha256(zipPath, channel.runtimeZipSha256, "语音识别服务");
  await extractZip(zipPath, runtimeDir(root), "语音识别服务");
  if (!runtimeReady(root)) {
    throw new Error("Runtime 解压后缺少 quicker-voice-runtime.exe");
  }
}

async function installModelFromLocal(src, root) {
  emitVoiceInstallProgress("model", 55, "正在安装语音识别模型（本地）…");
  const dest = modelDir(root);
  rmSync(dest, { recursive: true, force: true });
  copyDirRecursive(src, dest);
}

function parseDownloadProgressLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith(`${PROGRESS_MARKER}\t`)) return null;
  const rest = trimmed.slice(PROGRESS_MARKER.length + 1);
  const tab = rest.indexOf("\t");
  if (tab < 0) return null;
  const pct = Number.parseInt(rest.slice(0, tab), 10);
  const message = rest.slice(tab + 1).trim();
  if (!message || Number.isNaN(pct)) return null;
  return { percent: Math.min(pct, 100), message };
}

function runtimeExeForDownload(pluginRoot) {
  const installed = join(runtimeDir(pluginRoot), "quicker-voice-runtime.exe");
  if (existsSync(installed)) return installed;
  const packaged = packagedRuntimeDist();
  if (packaged && existsSync(join(packaged, "quicker-voice-runtime.exe"))) {
    return join(packaged, "quicker-voice-runtime.exe");
  }
  return null;
}

function runDownloadCommandWithProgress(cmd, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const parsed = parseDownloadProgressLine(line);
      if (parsed) {
        emitVoiceInstallProgress("download", parsed.percent, parsed.message);
      }
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr
        .split("\n")
        .filter(Boolean)
        .slice(-3)
        .join(" ")
        .trim();
      reject(new Error(tail || `模型下载失败（退出码 ${code}）`));
    });
  });
}

async function runPackagedDownloadModel(pluginRoot, preset, force) {
  const exe = runtimeExeForDownload(pluginRoot);
  if (!exe) {
    throw new Error("语音识别服务未安装，请先安装 Runtime");
  }
  const args = ["download-model", "--preset", preset, "--root", pluginRoot];
  if (force) args.push("--force");
  const workDir = dirname(exe);
  await runDownloadCommandWithProgress(exe, args, workDir, {
    QUICKER_VOICE_PLUGIN_ROOT: pluginRoot,
  });
}

async function runUvDownloadModel(pluginRoot, preset, force) {
  const repo = devRuntimeDir();
  if (!repo || !existsSync(join(repo, "pyproject.toml"))) {
    throw new Error("未找到 voice-asr-runtime 开发目录");
  }
  const args = [
    "run",
    "--directory",
    repo,
    "download-asr-model",
    "--preset",
    preset,
    "--root",
    pluginRoot,
  ];
  if (force) args.push("--force");
  await runDownloadCommandWithProgress("uv", args, repo, {
    QUICKER_VOICE_PLUGIN_ROOT: pluginRoot,
  });
}

async function downloadAsrModel(pluginRoot, preset, force, isDev) {
  emitVoiceInstallProgress(
    "prepare",
    0,
    force ? "准备重新下载模型…" : "准备下载模型…",
  );
  if (runtimeExeForDownload(pluginRoot)) {
    writeRuntimeModelIdentity(pluginRoot);
    await runPackagedDownloadModel(pluginRoot, preset, force);
  } else if (isDev) {
    await runUvDownloadModel(pluginRoot, preset, force);
  } else {
    throw new Error("语音识别服务未安装，请先安装 Runtime");
  }
  const ready =
    preset === "paraformer"
      ? paraformerModelReady(paraformerModelDir(pluginRoot))
      : modelDirReady(modelDir(pluginRoot));
  if (!ready) {
    throw new Error("模型下载结束但校验未通过，请重试");
  }
  emitVoiceInstallProgress("done", 100, "模型下载完成");
}

function presetFromModelId(modelId) {
  const id = String(modelId).trim().toLowerCase();
  if (id === "lightweight" || id === "paraformer" || id === "paraformer-zh") {
    return "paraformer";
  }
  return "sensevoice";
}

/**
 * @param {{ getPluginCtx: () => { resourcesRoot: string, app: import('electron').App }, isDev: boolean }} deps
 */
export async function runVoicePluginInstall(deps) {
  if (voiceInstallInFlight()) {
    throw new Error("语音插件正在安装中，请稍候");
  }
  setVoiceInstallInFlight(true);
  try {
    const root = voicePluginRoot();
    if (isVoiceAsrFullyInstalled(root)) {
      return root;
    }

    emitVoiceInstallProgress("prepare", 5, "准备安装…");
    mkdirSync(root, { recursive: true });
    const tempDir = join(root, `.install-tmp-${process.pid}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const needRuntime = !runtimeReady(root);
      const needModel = !modelDirReady(modelDir(root));

      if (needRuntime) {
        const localRuntime = packagedRuntimeDist();
        if (localRuntime) {
          await installRuntimeFromLocal(localRuntime, root);
        } else if (process.env.QUICKER_VOICE_RUNTIME_ZIP_PATH) {
          await extractZip(
            process.env.QUICKER_VOICE_RUNTIME_ZIP_PATH,
            runtimeDir(root),
            "语音识别服务",
          );
          if (!runtimeReady(root)) {
            throw new Error("Runtime zip 无效");
          }
        } else {
          const channel = await resolveVoiceChannel({
            ...deps.getPluginCtx(),
            forceRefresh: false,
          });
          await installRuntimeFromUrl(deps.getPluginCtx(), channel, root, tempDir);
        }
        writeRuntimeModelIdentity(root);
      }

      if (needModel) {
        if (runtimeReady(root)) {
          writeRuntimeModelIdentity(root);
        }
        const localModel = packagedModelDir();
        if (localModel) {
          await installModelFromLocal(localModel, root);
        } else {
          await downloadAsrModel(root, "sensevoice", false, deps.isDev);
        }
      }

      emitVoiceInstallProgress("manifest", 92, "写入配置…");
      writePluginMetadata(root);

      if (!isVoiceAsrFullyInstalled(root)) {
        throw new Error("安装未完成，请重试");
      }

      try {
        const channel = await resolveVoiceChannel({
          ...deps.getPluginCtx(),
          forceRefresh: false,
        });
        const version = String(channel.runtimeVersion ?? "").trim();
        if (version) {
          writeFileSync(join(root, "runtime-version.txt"), `${version}\n`, "utf8");
        }
      } catch {
        // optional
      }

      emitVoiceInstallProgress("done", 100, "安装完成，正在启动…");
      return root;
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  } finally {
    setVoiceInstallInFlight(false);
    endVoiceRuntimeStart();
  }
}

/**
 * @param {{ getPluginCtx: () => { resourcesRoot: string, app: import('electron').App }, isDev: boolean }} deps
 */
export async function redownloadVoiceModel(deps, modelId, force = true) {
  const preset = presetFromModelId(modelId);
  await downloadAsrModel(voicePluginRoot(), preset, force, deps.isDev);
}
