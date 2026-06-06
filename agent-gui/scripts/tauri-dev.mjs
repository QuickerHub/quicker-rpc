/**
 * Tauri dev entry: disable Turbopack (WebView2 hangs with HMR) and run `tauri dev`.
 */
import { spawn } from "node:child_process";

process.env.AGENT_GUI_TURBOPACK ??= "0";
process.env.AGENT_GUI_TAURI_SHELL ??= "1";
process.env.TAURI_ENV_DEBUG ??= "true";
const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "tauri", "dev"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
