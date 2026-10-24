import { configureAgentDataProfile } from "../../lib/agent-data-profile.mjs";
import { startAgentService } from "../../lib/agent-service/start-service";
import { loadProductionAgentRuntime } from "../../lib/agent-service/production-runtime.server";
import { beginShellSession, finishShellSession } from "../../lib/shell-session-registry.server";

async function main() {
  configureAgentDataProfile(process.env.QUICKER_AGENT_DATA_DIR);
  const sessionId = "generated-shell-watch-fixture";
  beginShellSession({ id: sessionId, commandLine: "synthetic snapshot; no process is launched", cwd: process.cwd(), shell: "fixture" });
  if (process.env.SHELL_WATCH_MODE === "completed") {
    finishShellSession(sessionId, { ok: true, stdout: "generated result", stderr: "", exitCode: 0, durationMs: 1,
      truncated: false, shell: "bash", cwd: process.cwd(), commandLine: "synthetic snapshot; no process is launched" });
  }
  const service = await startAgentService({ loadRuntime: loadProductionAgentRuntime, port: 0 });
  console.log(JSON.stringify({ event: "ready", origin: service.origin, sessionId }));
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= service.stop().then(() => {
    console.log(JSON.stringify({ event: "stopped", resources: process.getActiveResourcesInfo() }));
    if (process.connected) process.disconnect();
  });
  process.on("message", () => { void stop().catch(console.error); });
  process.once("disconnect", () => { void stop().catch(console.error); });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
