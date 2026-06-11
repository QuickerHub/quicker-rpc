import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronRoot = dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = join(electronRoot, "..");
const repoVoiceRuntime = join(agentGuiRoot, "..", "voice-asr-runtime");

export function devRuntimeDir() {
  if (existsSync(join(repoVoiceRuntime, "pyproject.toml"))) {
    return repoVoiceRuntime;
  }
  return null;
}

export function packagedRuntimeDist() {
  const dir = join(repoVoiceRuntime, "dist", "quicker-voice-runtime");
  if (existsSync(join(dir, "quicker-voice-runtime.exe"))) {
    return dir;
  }
  return null;
}

export function packagedModelDir() {
  const dir = join(repoVoiceRuntime, "models", "sensevoice");
  if (
    existsSync(join(dir, "tokens.txt"))
    && (existsSync(join(dir, "model.int8.onnx")) || existsSync(join(dir, "model.onnx")))
  ) {
    return dir;
  }
  return null;
}
