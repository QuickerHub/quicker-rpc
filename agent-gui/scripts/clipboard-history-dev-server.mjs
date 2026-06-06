/**
 * Dev helper: build (if needed) and run clipboard-history-runtime on :6020.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeRoot = join(repoRoot, "clipboard-history-runtime");
const port = process.env.QUICKER_CLIPBOARD_PORT || "6020";

const exe =
  process.platform === "win32"
    ? join(runtimeRoot, "target/debug/quicker-clipboard-history.exe")
    : join(runtimeRoot, "target/debug/quicker-clipboard-history");

if (!existsSync(exe)) {
  console.log("Building clipboard-history-runtime...");
  const build = spawnSync("cargo", ["build"], {
    cwd: runtimeRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const args = ["--host", "127.0.0.1", "--port", port];
const child = existsSync(exe)
  ? spawn(exe, args, { cwd: runtimeRoot, stdio: "inherit", env: process.env })
  : spawn("cargo", ["run", "--quiet", "--", ...args], {
      cwd: runtimeRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

child.on("exit", (code) => process.exit(code ?? 0));
