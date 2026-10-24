import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

for (const mode of ["completed", "head"] as const) {
  test(`production service exits naturally after a ${mode} shell watch response`, { timeout: 15_000 }, async () => {
    const parent = resolve("../.tmp");
    mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(join(parent, "shell-watch-stop-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["SystemRoot", "SystemDrive", "ComSpec", "PATH", "PATHEXT", "TEMP", "TMP"]) env[key] = process.env[key];
    Object.assign(env, {
      APPDATA: join(root, "roaming"), LOCALAPPDATA: join(root, "local"), HOME: join(root, "home"), USERPROFILE: join(root, "home"), XDG_DATA_HOME: join(root, "xdg"),
      QUICKER_AGENT_DATA_DIR: join(root, "profile"), AGENT_GUI_ROOT: join(root, "app"), AGENT_GUI_DEFAULT_CWD: workspace,
      LLM_CONFIG_PATH: join(root, "absent-llm.json"), BUNDLED_LLM_CONFIG_PATH: join(root, "absent-publish.json"), BUNDLED_LLM_DEV_CONFIG_PATH: join(root, "absent-dev.json"),
      BUNDLED_LLM_CONFIG: "{}", BUNDLED_LLM_REMOTE_CONFIG_DISABLED: "1", NODE_ENV: "production", SHELL_WATCH_MODE: mode,
      AGENT_GUI_SKIP_BROWSER_RUNTIME: "1", AGENT_GUI_SKIP_TERMINAL_RUNTIME: "1", TSX_TSCONFIG_PATH: resolve("tsconfig.json"),
    });
    const child = spawn(process.execPath, [
      "--conditions=react-server", "--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
      "--import", pathToFileURL(resolve("scripts/agent-offline-network-guard.mjs")).href,
      resolve("service/fixtures/shell-watch-lifecycle.ts"),
    ], { cwd: workspace, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const exited = once(child, "exit");
    let stdout = "", stderr = "", forced = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const event = async (name: string): Promise<{ origin: string; sessionId: string; resources: string[] }> => {
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        for (const line of stdout.split(/\r?\n/)) {
          try { const value = JSON.parse(line); if (value.event === name) return value; } catch { /* Partial line. */ }
        }
        assert.equal(child.exitCode, null, `child exited before ${name}: ${stderr}`);
        assert.equal(child.signalCode, null, `child was terminated before ${name}: ${stderr}`);
        await delay(10);
      }
      throw Error(`No ${name} event: ${stderr}`);
    };
    let stopped: unknown, elapsed: number | undefined;
    try {
      const { origin, sessionId } = await event("ready");
      const response = await fetch(`${origin}/api/shell/watch?${new URLSearchParams({ sessionId })}`, { method: mode === "head" ? "HEAD" : "GET" });
      assert.equal(response.status, 200);
      const body = await response.text();
      if (mode === "completed") assert.match(body, /"status":"success"/);
      else assert.equal(body, "");
      const start = Date.now();
      const timer = setTimeout(() => { forced = true; child.kill(); }, 5_000);
      try {
        child.send("shutdown");
        stopped = await event("stopped");
        await exited;
      } finally { clearTimeout(timer); }
      elapsed = Date.now() - start;
      assert.equal(forced, false, `service.stop completed but retained Shell SSE resources: ${JSON.stringify(stopped)}`);
      assert.ok(elapsed < 5_000);
      assert.equal(child.exitCode, 0, stderr);
      assert.equal(stderr, "");
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
      writeFileSync(join(root, "result.json"), JSON.stringify({ mode, root, stopped, elapsed, forced, exitCode: child.exitCode, signalCode: child.signalCode, stdout, stderr }, null, 2));
    }
  });
}
