import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attachTaggedLogs } from "./log-multiplexer.mjs";

/**
 * Run the dev-supervisor hot-update path (supervisor owns serve restart).
 * @param {string} repoRoot
 * @param {{ reason?: string }} [meta]
 */
export function runHotUpdateBuild(repoRoot, meta = {}) {
  const buildScript = join(repoRoot, "scripts", "Invoke-DevHotUpdate.ps1");
  const label = meta.reason ? ` (${meta.reason})` : "";
  const args = ["-NoProfile", "-File", buildScript];
  if (meta.reason) {
    args.push("-Reason", meta.reason);
  }

  return new Promise((resolve, reject) => {
    console.log(`[build] hot-update started${label}`);
    const child = spawn(
      "pwsh",
      args,
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        windowsHide: true,
      },
    );
    attachTaggedLogs(child, "build");

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        let version = "";
        try {
          const raw = readFileSync(join(repoRoot, "version.json"), "utf8");
          version = JSON.parse(raw)?.QuickerRpc ?? "";
        } catch {
          // ignore
        }
        console.log(
          `[build] hot-update done${version ? ` (QuickerRpc ${version})` : ""}`,
        );
        resolve({ version });
      } else {
        reject(new Error(`dev hot-update failed (exit ${code ?? "null"})`));
      }
    });
  });
}
