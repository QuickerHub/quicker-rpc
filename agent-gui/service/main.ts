import { parseAgentServiceOptions } from "./cli";
import { startAgentService } from "../lib/agent-service/start-service";
import { configureAgentDataProfile } from "../lib/agent-data-profile.mjs";
import { createStaticRendererHandler } from "../lib/agent-service/static-renderer";
import { configureOwnedRuntimeEnvironment } from "./runtime-environment";

async function main() {
  const options = parseAgentServiceOptions(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: agent-service [--host 127.0.0.1|::1] [--port 0..65535] [--data-dir <absolute>] [--renderer-dir <absolute>]\nStandard HTTP/SSE API and optional static React renderer; no automatic qkrpc startup.\n--data-dir selects a dedicated profile; it never clears files or migrates another profile.");
    return;
  }
  if (!process.env.NODE_ENV) Reflect.set(process.env, "NODE_ENV", "production");
  const profile = configureAgentDataProfile(options.dataDir);
  await configureOwnedRuntimeEnvironment(options.host, profile.directory);
  const { loadProductionAgentRuntime } = await import("../lib/agent-service/production-runtime.server");
  const service = await startAgentService({
    ...options,
    loadRuntime: loadProductionAgentRuntime,
    serveRenderer: options.rendererDir ? createStaticRendererHandler(options.rendererDir) : undefined,
    onError: (error) => console.error("[agent service]", error),
  });
  process.env.PORT = String(service.address.port);
  process.env.HOSTNAME = options.host;
  console.log(JSON.stringify({ event: "agent-service-ready", origin: service.origin, protocolVersion: 1, capabilities: ["chat", "http-api", ...(options.rendererDir ? ["renderer"] : [])] }));
  const shutdown = () => {
    void service.stop().then(() => { if (process.connected) process.disconnect(); }).catch((error: unknown) => {
      console.error("[agent service shutdown]", error);
      if (error instanceof AggregateError) for (const cause of error.errors) console.error("[cleanup cause]", cause);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  if (process.send) process.on("message", (message) => { if (message === "shutdown") shutdown(); });
  if (process.send) process.once("disconnect", shutdown);
}

void main().catch((error: unknown) => {
  console.error("[agent service startup]", error);
  process.exitCode = 1;
});
