import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

test("the actual Node entry serves lazy health and rejects an unconfigured model within an isolated profile", { timeout: 15_000 }, async () => {
  const parent = resolve("..", ".tmp");
  mkdirSync(parent, { recursive: true });
  const root = realpathSync(mkdtempSync(join(parent, "agent-service-cli-")));
  const profile = join(root, "selected profile");
  const expectedParent = realpathSync(parent);
  const env = { ...process.env,
    APPDATA: join(root, "roaming"), LOCALAPPDATA: join(root, "local"), USERPROFILE: join(root, "home"), HOME: join(root, "home"),
    XDG_DATA_HOME: join(root, "xdg"), OneDrive: "", AGENT_GUI_ROOT: join(root, "app"), AGENT_GUI_DEFAULT_CWD: join(root, "workspace"),
    LLM_CONFIG_PATH: join(root, "absent-llm.json"), BUNDLED_LLM_CONFIG_PATH: join(root, "absent-publish.json"),
    BUNDLED_LLM_DEV_CONFIG_PATH: join(root, "absent-dev.json"), BUNDLED_LLM_CONFIG: "{}", NODE_ENV: "production",
    AGENT_GUI_SKIP_BROWSER_RUNTIME: "1", AGENT_GUI_SKIP_TERMINAL_RUNTIME: "1", AGENT_GUI_SKIP_VOICE_RUNTIME: "1",
    QUICKER_AGENT_DATA_DIR: join(root, "environment-profile"),
  };
  const child = spawn(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "--import", "./scripts/agent-offline-network-guard.mjs",
    "./service/main.ts", "--port", "0", "--data-dir", profile,
  ], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const exited = once(child, "exit");
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const origin = await new Promise<string>((done, fail) => {
      let output = "";
      const timer = setTimeout(() => fail(Error("service startup timed out: " + stderr)), 8_000);
      child.once("error", fail);
      child.once("exit", () => { clearTimeout(timer); fail(Error("service exited before ready: " + stderr)); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        for (const line of output.split(/\r?\n/)) {
          try {
            const ready = JSON.parse(line);
            if (ready.event === "agent-service-ready") { clearTimeout(timer); done(ready.origin); return; }
          } catch { /* A partial stdout line is not a handshake. */ }
        }
      });
    });
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(origin + "/health");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).runtime, "lazy");
    assert.equal(existsSync(join(env.APPDATA, "QuickerAgent", "agent.db")), false);
    assert.equal(existsSync(profile), false, "health leaves the selected profile lazy");
    assert.equal(existsSync(env.AGENT_GUI_ROOT), false, "health does not initialize the app/config directory");
    mkdirSync(env.AGENT_GUI_DEFAULT_CWD, { recursive: true });
    const chat = await fetch(origin + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      messages: [{ id: "offline-user", role: "user", parts: [{ type: "text", text: "offline configuration probe" }] }],
      llmSelection: "profile:__offline_missing__/unconfigured", chatMode: "ask", enabledTools: [],
      workingDirectory: env.AGENT_GUI_DEFAULT_CWD,
    }) });
    assert.equal(chat.status, 400);
    assert.deepEqual(await chat.json(), { error: "Model selection is not configured" });
    const dataRoot = process.platform === "win32" ? env.APPDATA
      : process.platform === "darwin" ? join(env.HOME, "Library", "Application Support") : env.XDG_DATA_HOME;
    assert.equal(existsSync(join(profile, "agent.db")), true, "CLI profile takes precedence before production runtime loads");
    assert.equal(existsSync(join(profile, "agent.db.writer.sqlite")), true);
    assert.equal(existsSync(join(dataRoot, "QuickerAgent", "agent.db")), false);
    assert.equal(existsSync(env.QUICKER_AGENT_DATA_DIR), false);
    assert.equal(stderr.includes("attempted a real network request"), false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    assert.ok(root.startsWith(expectedParent + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
