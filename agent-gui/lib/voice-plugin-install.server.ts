import "server-only";

import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  resolveLegacyVoiceAsrPluginDirectory,
  resolveVoiceAsrPluginDirectory,
} from "@/lib/quicker-agent-paths";

const execFileAsync = promisify(execFile);

const MODEL_SUBDIR = "sensevoice";
const MANIFEST_PATH = join(
  process.cwd(),
  "src-tauri/resources/voice-plugin-manifest.json",
);
const SETTINGS_JSON =
  '{"autoStart":true,"modelId":"standard","gpuAcceleration":false,"language":"zh-CN","silentStopSeconds":0,"streamingPreview":false,"maxRecordingSeconds":120,"wsPort":6016}';
const CHANNEL_PATH = join(
  process.cwd(),
  "src-tauri/resources/voice-plugin-channel.json",
);
const MODEL_IDENTITY_PATH = join(
  process.cwd(),
  "src-tauri/resources/voice-sensevoice-model-identity.json",
);

type VoicePluginChannel = {
  runtimeVersion: string;
  runtimeZipUrl: string;
  modelZipUrl: string;
  runtimeZipMirrorUrl?: string;
  modelZipMirrorUrl?: string;
  runtimeZipSha256?: string;
  modelZipSha256?: string;
};

type ModelFileSpec = { size: number; sha256: string };

type SenseVoiceModelIdentity = {
  id: string;
  modelscopeResolveBase?: string;
  files: Record<string, ModelFileSpec>;
};

export type VoiceInstallProgress = {
  phase: string;
  percent: number;
  message: string;
};

export type VoicePluginHostStatus = {
  status: string;
  installed: boolean;
  running: boolean;
  wsPort: number;
  pluginDir: string | null;
  message: string | null;
  progress: VoiceInstallProgress | null;
  installSummary: string | null;
  localSourcesAvailable: boolean;
};

let installInFlight = false;
let installProgress: VoiceInstallProgress | null = null;
let installError: string | null = null;
let lastInstallSummary: string | null = null;

export type DevVoiceInstallOptions = {
  /** Remove existing plugin dir before install. */
  force?: boolean;
  /** Skip voice-asr-runtime local dist/models; use network sources. */
  preferNetwork?: boolean;
};

function repoRoot(): string {
  return join(process.cwd(), "..");
}

function voicePluginRoot(): string {
  const primary = resolveVoiceAsrPluginDirectory();
  const legacy = resolveLegacyVoiceAsrPluginDirectory();
  if (existsSync(join(primary, "manifest.json"))) return primary;
  if (existsSync(join(legacy, "manifest.json"))) return legacy;
  return primary;
}

function runtimeDir(root: string): string {
  return join(root, "runtime");
}

function modelDir(root: string): string {
  return join(root, "models", MODEL_SUBDIR);
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256HexFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function verifySha256(
  path: string,
  expected: string | undefined,
  label: string,
): Promise<void> {
  const trimmed = expected?.trim();
  if (!trimmed) return;
  const actual = await sha256HexFile(path);
  if (actual.toLowerCase() !== trimmed.toLowerCase()) {
    throw new Error(`${label}校验失败（sha256 不匹配）`);
  }
}

function verifyModelIdentity(dir: string): boolean {
  try {
    const identity = loadJson<SenseVoiceModelIdentity>(MODEL_IDENTITY_PATH);
    for (const [name, spec] of Object.entries(identity.files)) {
      const path = join(dir, name);
      if (!existsSync(path)) return false;
      const size = statSync(path).size;
      if (size !== spec.size) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function runtimeReady(root: string): boolean {
  return existsSync(join(runtimeDir(root), "quicker-voice-runtime.exe"));
}

function modelReady(root: string): boolean {
  return verifyModelIdentity(modelDir(root));
}

function isInstalled(root: string): boolean {
  return (
    existsSync(join(root, "manifest.json"))
    && runtimeReady(root)
    && modelReady(root)
  );
}

function setProgress(phase: string, percent: number, message: string): void {
  installProgress = { phase, percent, message };
}

async function removeDirAll(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

async function copyDirRecursive(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(src, dst);
    } else {
      await mkdir(dirname(dst), { recursive: true });
      await copyFile(src, dst);
    }
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  if (process.platform === "win32") {
    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedDest = destDir.replace(/'/g, "''");
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
    ]);
    return;
  }
  await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
}

async function downloadFile(
  urls: string[],
  dest: string,
  label: string,
  percentStart: number,
  percentEnd: number,
): Promise<void> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      setProgress("download", percentStart, `正在下载${label}…`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const total = Number(res.headers.get("content-length") ?? 0);
      const reader = res.body?.getReader();
      if (!reader) {
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(dest, buf);
        setProgress("download", percentEnd, `${label}下载完成`);
        return;
      }
      const chunks: Uint8Array[] = [];
      let downloaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          downloaded += value.length;
          if (total > 0) {
            const pct =
              percentStart
              + Math.floor(((downloaded / total) * (percentEnd - percentStart)));
            setProgress(
              "download",
              Math.min(pct, percentEnd),
              `正在下载${label}… ${Math.floor(downloaded / (1024 * 1024))} / ${Math.floor(total / (1024 * 1024))} MB`,
            );
          }
        }
      }
      await writeFile(dest, Buffer.concat(chunks));
      setProgress("download", percentEnd, `${label}下载完成`);
      return;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      await rm(dest, { force: true });
    }
  }
  throw new Error(`下载${label}失败: ${errors.join(" | ")}`);
}

function downloadUrls(mirror: string | undefined, primary: string): string[] {
  const urls: string[] = [];
  const m = mirror?.trim();
  if (m) urls.push(m);
  urls.push(primary.trim());
  return urls;
}

function packagedRuntimeDist(): string | null {
  const dir = join(repoRoot(), "voice-asr-runtime/dist/quicker-voice-runtime");
  return existsSync(join(dir, "quicker-voice-runtime.exe")) ? dir : null;
}

function packagedModelDir(): string | null {
  const dir = join(repoRoot(), "voice-asr-runtime/models", MODEL_SUBDIR);
  return verifyModelIdentity(dir) ? dir : null;
}

async function installRuntimeFromLocal(src: string, root: string): Promise<void> {
  setProgress("runtime", 15, "正在复制语音识别服务…");
  const dest = runtimeDir(root);
  await removeDirAll(dest);
  await copyDirRecursive(src, dest);
  if (!runtimeReady(root)) {
    throw new Error("本地 Runtime 复制后缺少 quicker-voice-runtime.exe");
  }
}

async function installModelFromLocal(src: string, root: string): Promise<void> {
  setProgress("model", 60, "正在复制识别模型…");
  const dest = modelDir(root);
  await removeDirAll(dest);
  await copyDirRecursive(src, dest);
  if (!modelReady(root)) {
    throw new Error("本地模型复制后文件不完整");
  }
}

async function installRuntimeFromChannel(
  channel: VoicePluginChannel,
  root: string,
  tempDir: string,
): Promise<void> {
  const zipPath = join(tempDir, "runtime.zip");
  await downloadFile(
    downloadUrls(channel.runtimeZipMirrorUrl, channel.runtimeZipUrl),
    zipPath,
    "语音识别服务",
    10,
    45,
  );
  await verifySha256(zipPath, channel.runtimeZipSha256, "语音识别服务");
  const dest = runtimeDir(root);
  await removeDirAll(dest);
  await extractZip(zipPath, dest);
  if (!runtimeReady(root)) {
    throw new Error("Runtime 解压后缺少 quicker-voice-runtime.exe");
  }
}

const MODEL_DOWNLOAD_PROGRESS_MARKER = "QUICKER_VOICE_PROGRESS";

function runtimeExeForDownload(pluginRoot: string): string | null {
  const installed = join(runtimeDir(pluginRoot), "quicker-voice-runtime.exe");
  if (existsSync(installed)) return installed;
  const packaged = join(
    repoRoot(),
    "voice-asr-runtime/dist/quicker-voice-runtime/quicker-voice-runtime.exe",
  );
  return existsSync(packaged) ? packaged : null;
}

function spawnModelDownload(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Partial<NodeJS.ProcessEnv>;
    onProgress?: (phase: string, percent: number, message: string) => void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        ...options.env,
      },
      windowsHide: true,
    });

    let stderr = "";
    let stdoutBuffer = "";
    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith(`${MODEL_DOWNLOAD_PROGRESS_MARKER}\t`)) return;
      const parts = trimmed.split("\t");
      const percent = Number(parts[1]);
      const message = parts.slice(2).join("\t").trim();
      if (!Number.isFinite(percent) || !message) return;
      if (options.onProgress) {
        options.onProgress("download", percent, message);
      } else {
        setModelDownloadProgress("download", percent, message);
      }
    };

    child.stdout?.on("data", (data: Buffer | string) => {
      stdoutBuffer += Buffer.isBuffer(data) ? data.toString("utf8") : data;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });
    child.stderr?.on("data", (data: Buffer | string) => {
      stderr += Buffer.isBuffer(data) ? data.toString("utf8") : data;
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr.trim().split(/\r?\n/).slice(-3).join(" ").trim();
      reject(new Error(tail || `模型下载失败（退出码 ${code ?? "unknown"}）`));
    });
  });
}

async function ensureAsrModel(
  preset: "sensevoice" | "paraformer",
  options?: {
    force?: boolean;
    onProgress?: (phase: string, percent: number, message: string) => void;
  },
): Promise<void> {
  const force = options?.force === true;
  const pluginRoot = voicePluginRoot();
  mkdirSync(pluginRoot, { recursive: true });
  const progress = options?.onProgress ?? setProgress;

  progress("prepare", 0, force ? "准备重新下载模型…" : "准备下载模型…");

  const exe = runtimeExeForDownload(pluginRoot);
  const commonArgs = [
    "--preset",
    preset,
    "--root",
    pluginRoot,
    ...(force ? ["--force"] as const : []),
  ];

  if (exe) {
    await writeRuntimeModelIdentity(pluginRoot);
    await spawnModelDownload(
      exe,
      ["download-model", ...commonArgs],
      {
        cwd: dirname(exe),
        env: { QUICKER_VOICE_PLUGIN_ROOT: pluginRoot },
        onProgress: progress,
      },
    );
  } else {
    const runtimeProject = join(repoRoot(), "voice-asr-runtime");
    if (!existsSync(join(runtimeProject, "pyproject.toml"))) {
      throw new Error("未找到 voice-asr-runtime；请先安装 Runtime 或保留开发目录");
    }
    await spawnModelDownload(
      "uv",
      [
        "run",
        "--directory",
        runtimeProject,
        "download-asr-model",
        ...commonArgs,
      ],
      {
        env: {
          QUICKER_VOICE_PLUGIN_ROOT: pluginRoot,
          QUICKER_VOICE_ASR_MODEL: preset,
        },
        onProgress: progress,
      },
    );
  }

  const modelId = preset === "paraformer" ? "lightweight" : "standard";
  if (!isVoiceModelInstalled(modelId)) {
    throw new Error("模型下载结束但校验未通过，请重试或点击「重新下载」");
  }
  progress("done", 100, "模型下载完成");
}

async function writeRuntimeModelIdentity(root: string): Promise<void> {
  const dest = join(
    runtimeDir(root),
    "models",
    "sensevoice-model-identity.json",
  );
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, readFileSync(MODEL_IDENTITY_PATH, "utf8"), "utf8");
}

async function writePluginMetadata(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const manifest = readFileSync(MANIFEST_PATH, "utf8");
  writeFileSync(join(root, "manifest.json"), manifest, "utf8");
  const settingsPath = join(root, "settings.json");
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, SETTINGS_JSON, "utf8");
  }
}

async function runInstallInner(options: DevVoiceInstallOptions = {}): Promise<void> {
  const root = voicePluginRoot();
  const preferNetwork = options.preferNetwork === true;
  const summaryParts: string[] = [];

  if (options.force) {
    setProgress("prepare", 2, "清理旧安装…");
    await removeDirAll(root);
    await mkdir(root, { recursive: true });
  } else if (isInstalled(root)) {
    lastInstallSummary = "插件已安装，无需重复安装";
    setProgress("done", 100, lastInstallSummary);
    return;
  }

  installError = null;
  setProgress("prepare", 5, "准备安装…");
  await mkdir(root, { recursive: true });

  const tempDir = join(tmpdir(), `quicker-voice-asr-${process.pid}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const channel = loadJson<VoicePluginChannel>(CHANNEL_PATH);
    const needRuntime = !runtimeReady(root);
    const needModel = !modelReady(root);

    if (needRuntime) {
      const localRuntime = preferNetwork ? null : packagedRuntimeDist();
      if (localRuntime) {
        await installRuntimeFromLocal(localRuntime, root);
        summaryParts.push("Runtime：本地仓库复制");
      } else {
        await installRuntimeFromChannel(channel, root, tempDir);
        summaryParts.push("Runtime：网络下载");
      }
      await writeRuntimeModelIdentity(root);
    }

    if (needModel) {
      if (runtimeReady(root)) {
        await writeRuntimeModelIdentity(root);
      }
      const localModel = preferNetwork ? null : packagedModelDir();
      if (localModel) {
        await installModelFromLocal(localModel, root);
        summaryParts.push("模型：本地仓库复制");
      } else {
        await ensureAsrModel("sensevoice", { onProgress: setProgress });
        summaryParts.push("模型：quicker-voice-runtime 下载");
      }
    }

    if (!needRuntime && !needModel) {
      summaryParts.push("文件已完整，仅更新配置");
    }

    setProgress("manifest", 92, "写入配置…");
    await writePluginMetadata(root);

    if (!isInstalled(root)) {
      throw new Error("安装未完成，请重试");
    }

    writeFileSync(
      join(root, "runtime-version.txt"),
      `${channel.runtimeVersion.trim()}\n`,
      "utf8",
    );
    lastInstallSummary = `安装完成（${summaryParts.join("；")}）`;
    setProgress("done", 100, lastInstallSummary);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function getVoicePluginHostStatus(): VoicePluginHostStatus {
  const root = voicePluginRoot();
  const port = Number(process.env.QUICKER_VOICE_PORT ?? process.env.AGENT_GUI_VOICE_PORT ?? 6016);
  const installed = isInstalled(root);
  const localSourcesAvailable =
    packagedRuntimeDist() !== null || packagedModelDir() !== null;

  const base = {
    installSummary: lastInstallSummary,
    localSourcesAvailable,
  };

  if (installInFlight) {
    const installedDuringInstall = isInstalled(root);
    return {
      ...base,
      status: installedDuringInstall ? "installed" : "downloading",
      installed: installedDuringInstall,
      running: false,
      wsPort: port,
      pluginDir: root,
      message: installProgress?.message ?? "正在安装…",
      progress: installProgress,
    };
  }

  if (installError) {
    return {
      ...base,
      status: "error",
      installed,
      running: false,
      wsPort: port,
      pluginDir: existsSync(join(root, "manifest.json")) ? root : null,
      message: installError,
      progress: null,
    };
  }

  if (!installed) {
    const localHint = localSourcesAvailable
      ? "检测到本地 voice-asr-runtime，首次安装会快速复制而非下载。"
      : "将从网络下载安装包。";
    return {
      ...base,
      status: "not_installed",
      installed: false,
      running: false,
      wsPort: 0,
      pluginDir: existsSync(root) ? root : null,
      message: `未安装。${localHint}`,
      progress: null,
    };
  }

  return {
    ...base,
    status: "installed",
    installed: true,
    running: false,
    wsPort: port,
    pluginDir: root,
    message:
      lastInstallSummary
      ?? (localSourcesAvailable
        ? "插件已安装。dev 默认优先本地复制；要测网络下载请勾选「强制网络下载」后重新安装。"
        : "插件已安装（dev 模式 Runtime 仍由 start.mjs / uv 提供）。"),
    progress: null,
  };
}

export function startDevVoicePluginInstall(
  options: DevVoiceInstallOptions = {},
): { ok: boolean; skipped?: boolean; error?: string } {
  if (installInFlight) {
    return { ok: false, error: "语音插件正在安装中，请稍候" };
  }

  const root = voicePluginRoot();
  if (!options.force && isInstalled(root)) {
    return { ok: true, skipped: true };
  }

  installInFlight = true;
  installError = null;
  if (options.force) {
    lastInstallSummary = null;
  }
  installProgress = { phase: "prepare", percent: 5, message: "准备安装…" };

  void runInstallInner(options)
    .catch((err) => {
      installError = err instanceof Error ? err.message : String(err);
      setProgress("error", 0, installError);
    })
    .finally(() => {
      installInFlight = false;
    });

  return { ok: true };
}

export function clearDevVoicePluginInstallError(): void {
  installError = null;
}

const PARAFORMER_SUBDIR = "paraformer-zh";

export type VoicePluginSettingsFile = {
  autoStart: boolean;
  modelId: string;
  gpuAcceleration: boolean;
  language: string;
  silentStopSeconds: number;
  streamingPreview: boolean;
  maxRecordingSeconds: number;
  wsPort: number;
};

function voiceSettingsPath(): string {
  return join(voicePluginRoot(), "settings.json");
}

export function readVoicePluginSettingsFile(): VoicePluginSettingsFile {
  const path = voiceSettingsPath();
  if (!existsSync(path)) {
    return JSON.parse(SETTINGS_JSON) as VoicePluginSettingsFile;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<VoicePluginSettingsFile>;
    return {
      ...(JSON.parse(SETTINGS_JSON) as VoicePluginSettingsFile),
      ...raw,
      gpuAcceleration: raw.gpuAcceleration === true,
    };
  } catch {
    return JSON.parse(SETTINGS_JSON) as VoicePluginSettingsFile;
  }
}

export function writeVoicePluginSettingsFile(
  settings: VoicePluginSettingsFile,
): void {
  const path = voiceSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

const PARAFORMER_MIN_ONNX_BYTES = 20 * 1024 * 1024;
const PARAFORMER_MIN_TOKENS_BYTES = 64;

function onnxModelReady(dir: string): boolean {
  return (
    existsSync(join(dir, "tokens.txt"))
    && (existsSync(join(dir, "model.int8.onnx"))
      || existsSync(join(dir, "model.onnx")))
  );
}

function paraformerModelValid(dir: string): boolean {
  if (!onnxModelReady(dir)) return false;
  const tokensPath = join(dir, "tokens.txt");
  const onnxPath = existsSync(join(dir, "model.int8.onnx"))
    ? join(dir, "model.int8.onnx")
    : join(dir, "model.onnx");
  try {
    return (
      statSync(tokensPath).size >= PARAFORMER_MIN_TOKENS_BYTES
      && statSync(onnxPath).size >= PARAFORMER_MIN_ONNX_BYTES
    );
  } catch {
    return false;
  }
}

export function resolveVoiceModelDir(
  modelId: "standard" | "lightweight",
): string {
  const root = voicePluginRoot();
  const subdir = modelId === "lightweight" ? PARAFORMER_SUBDIR : MODEL_SUBDIR;
  if (modelId === "standard" && verifyModelIdentity(modelDir(root))) {
    return modelDir(root);
  }
  return join(root, "models", subdir);
}

export function isVoiceModelInstalled(
  modelId: "standard" | "lightweight",
): boolean {
  if (modelId === "standard") {
    const root = voicePluginRoot();
    return (
      verifyModelIdentity(modelDir(root))
      || verifyModelIdentity(join(root, "models", MODEL_SUBDIR))
    );
  }
  return paraformerModelValid(resolveVoiceModelDir("lightweight"));
}

export function isVoiceModelPartial(
  modelId: "standard" | "lightweight",
): boolean {
  const dir = resolveVoiceModelDir(modelId);
  if (!existsSync(dir)) return false;
  try {
    const hasEntries = readdirSync(dir).some(
      (name) => name !== ".gitkeep" && name !== "README.md",
    );
    return hasEntries && !isVoiceModelInstalled(modelId);
  } catch {
    return false;
  }
}

export function removeVoiceModel(modelId: "standard" | "lightweight"): void {
  const root = voicePluginRoot();
  const dir = resolveVoiceModelDir(modelId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (modelId === "standard") {
    const legacy = modelDir(root);
    if (existsSync(legacy) && legacy !== dir) {
      rmSync(legacy, { recursive: true, force: true });
    }
  }
}

let modelDownloadInFlight = false;
let modelDownloadError: string | null = null;
let modelDownloadProgress: VoiceInstallProgress | null = null;

function setModelDownloadProgress(
  phase: string,
  percent: number,
  message: string,
): void {
  modelDownloadProgress = {
    phase,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    message,
  };
}

async function runVoiceModelDownload(
  preset: "sensevoice" | "paraformer",
  force = false,
): Promise<void> {
  const modelId = preset === "paraformer" ? "lightweight" : "standard";
  if (force || !isVoiceModelInstalled(modelId) || isVoiceModelPartial(modelId)) {
    removeVoiceModel(modelId);
  }
  await ensureAsrModel(preset, {
    force,
    onProgress: (phase, percent, message) => {
      setModelDownloadProgress(phase, percent, message);
    },
  });
}

export function getVoiceModelDownloadState(): {
  inFlight: boolean;
  error: string | null;
  progress: VoiceInstallProgress | null;
} {
  return {
    inFlight: modelDownloadInFlight,
    error: modelDownloadError,
    progress: modelDownloadProgress,
  };
}

export function startVoiceModelDownload(
  preset: "sensevoice" | "paraformer",
  options?: { force?: boolean },
): { ok: boolean; error?: string } {
  if (modelDownloadInFlight) {
    return { ok: false, error: "模型正在下载中，请稍候" };
  }

  const modelId = preset === "paraformer" ? "lightweight" : "standard";
  const force =
    options?.force === true
    || !isVoiceModelInstalled(modelId)
    || isVoiceModelPartial(modelId);
  modelDownloadInFlight = true;
  modelDownloadError = null;
  setModelDownloadProgress(
    "prepare",
    0,
    force ? "准备重新下载模型…" : "准备下载模型…",
  );

  void runVoiceModelDownload(preset, force)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      modelDownloadError = message;
      setModelDownloadProgress("error", 0, message);
    })
    .finally(() => {
      modelDownloadInFlight = false;
    });

  return { ok: true };
}
