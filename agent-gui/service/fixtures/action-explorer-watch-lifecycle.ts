import { configureAgentDataProfile } from "../../lib/agent-data-profile.mjs";
import { startAgentService } from "../../lib/agent-service/start-service";
import { loadProductionAgentRuntime } from "../../lib/agent-service/production-runtime.server";

async function main() {
  configureAgentDataProfile(process.env.QUICKER_AGENT_DATA_DIR);
  const service = await startAgentService({ loadRuntime: loadProductionAgentRuntime, port: 0 });
  console.log(JSON.stringify({ event: "ready", origin: service.origin }));
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= service.stop().then(() => {
    console.log(JSON.stringify({ event: "stopped", resources: process.getActiveResourcesInfo() }));
    if (process.connected) process.disconnect();
  });
  process.on("message", () => { void stop().catch(console.error); });
  process.once("disconnect", () => { void stop().catch(console.error); });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
