import { configureAgentDataProfile } from "../../lib/agent-data-profile.mjs";
import { startAgentService } from "../../lib/agent-service/start-service";
import { loadProductionAgentRuntime } from "../../lib/agent-service/production-runtime.server";
import { fetchBrowserRuntimeHealth } from "@/lib/browser-runtime-lifecycle.mjs";

async function main() {
  configureAgentDataProfile(process.env.QUICKER_AGENT_DATA_DIR);
  const service = await startAgentService({ loadRuntime: async () => {
    const runtime = await loadProductionAgentRuntime();
    return { ...runtime, handleRequest: async (request: Request) => {
      try {
        if (process.env.FIXTURE_REJECTED_HEALTH === "1") {
          return Response.json(await fetchBrowserRuntimeHealth(process.env.FIXTURE_HEALTH_BASE!, undefined, request.signal));
        }
        return await runtime.handleRequest!(request);
      }
      finally { if (request.signal.aborted) console.log(JSON.stringify({ event: "request-finished" })); }
    } };
  }, port: 0 });
  console.log(JSON.stringify({ event: "ready", origin: service.origin }));
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= service.stop().then(() => {
    console.log(JSON.stringify({ event: "stopped", resources: process.getActiveResourcesInfo() }));
    if (process.connected) process.disconnect();
  });
  process.on("message", () => { void stop().catch((error) => { console.error(error); process.exitCode = 1; }); });
  process.once("disconnect", () => { void stop().catch((error) => { console.error(error); process.exitCode = 1; }); });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
