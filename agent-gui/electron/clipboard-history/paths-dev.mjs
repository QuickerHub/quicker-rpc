import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronRoot = dirname(fileURLToPath(import.meta.url));
const repoRuntime = join(electronRoot, "..", "..", "..", "clipboard-history-runtime");

export function devRuntimeDir() {
  if (existsSync(join(repoRuntime, "Cargo.toml"))) {
    return repoRuntime;
  }
  return null;
}

export function devRuntimeExe() {
  const dir = devRuntimeDir();
  if (!dir) return null;
  const exe = join(dir, "target", "debug", "quicker-clipboard-history.exe");
  return existsSync(exe) ? exe : null;
}
