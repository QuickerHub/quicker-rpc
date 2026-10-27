import { parseAgentServiceOptions } from "./cli";
import { startAgentService } from "../lib/agent-service/start-service";
import { configureAgentDataProfile } from "../lib/agent-data-profile.mjs";
import { createStaticRendererHandler } from "../lib/agent-service/static-renderer";
import { configureOwnedRuntimeEnvironment } from "./runtime-environment";
import { runOwnedServiceStartup } from "./startup-lifecycle";

async function main() {
  const options = parseAgentServiceOptions(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: agent-service [--host 127.0.0.1|::1] [--port 0..65535] [--data-dir <absolute>] [--renderer-dir <absolute>]\nStandard HTTP/SSE API and optional static React renderer; no automatic qkrpc startup.\n--data-dir selects a dedicated profile; it never clears files or migrates another profile.");
    return;
  }
  if (!process.env.NODE_ENV) Reflect.set(process.env, "NODE_ENV", "production");
  await runOwnedServiceStartup({
    process,
    async start(signal) {
      signal.throwIfAborted();
      const profile = configureAgentDataProfile(options.dataDir);
      await configureOwnedRuntimeEnvironment(options.host, profile.directory);
      signal.throwIfAborted();
      const { loadProductionAgentRuntime } = await import("../lib/agent-service/production-runtime.server");
      signal.throwIfAborted();
      // The lifecycle must retain a late owner before checking cancellation again.
      return startAgentService({
        ...options,
        loadRuntime: loadProductionAgentRuntime,
        serveRenderer: options.rendererDir ? createStaticRendererHandler(options.rendererDir) : undefined,
        onError: (error) => console.error("[agent service]", error),
      });
    },
    onReady(service) {
      process.env.PORT = String(service.address.port);
      process.env.HOSTNAME = options.host;
      console.log(JSON.stringify({ event: "agent-service-ready", origin: service.origin, protocolVersion: 1, capabilities: ["chat", "http-api", ...(options.rendererDir ? ["renderer"] : [])] }));
    },
  });
}

void main().catch((error: unknown) => {
  console.error("[agent service lifecycle]", error);
  if (error instanceof AggregateError) for (const cause of error.errors) console.error("[cleanup cause]", cause);
  process.exitCode = 1;
});
