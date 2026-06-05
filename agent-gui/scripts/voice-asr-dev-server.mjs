/**
 * @deprecated Use voice-asr-runtime Python package: pnpm voice:dev-server
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeDir = join(repoRoot, "voice-asr-runtime");

console.warn(
  "[voice-asr-dev-server.mjs] deprecated — starting voice-asr-runtime via uv",
);

const child = spawn("uv", ["run", "quicker-voice-runtime"], {
  cwd: runtimeDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
