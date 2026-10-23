import { parseAgentServiceOptions } from "./cli";
import { startAgentService } from "../lib/agent-service/start-service";
import { configureAgentDataProfile } from "../lib/agent-data-profile.mjs";

async function main() {
  const options = parseAgentServiceOptions(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: agent-service [--host 127.0.0.1|::1] [--port 0..65535] [--data-dir <absolute>]\nExperimental: /health and /api/chat; existing data/config format, no UI or automatic qkrpc startup.\n--data-dir selects a dedicated profile; it never clears files or migrates another profile.");
    return;
  }
  if (!process.env.NODE_ENV) Reflect.set(process.env, "NODE_ENV", "production");
  configureAgentDataProfile(options.dataDir);
  const { loadProductionAgentRuntime } = await import("../lib/agent-service/production-runtime.server");
  const service = await startAgentService({
    ...options,
    loadRuntime: loadProductionAgentRuntime,
    onError: (error) => console.error("[agent service]", error),
  });
  console.log(JSON.stringify({ event: "agent-service-ready", origin: service.origin, protocolVersion: 1, capabilities: ["chat"] }));
  const shutdown = () => {
    void service.stop().catch((error: unknown) => {
      console.error("[agent service shutdown]", error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error("[agent service startup]", error);
  process.exitCode = 1;
});
