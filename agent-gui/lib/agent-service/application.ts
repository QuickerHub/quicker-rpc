import { createAgentChatHandler, type AgentChatHandlerServices } from "./chat-handler";

export const AGENT_SERVICE_PROTOCOL_VERSION = 1;

export type AgentServiceRuntime = {
  runTurn: AgentChatHandlerServices["runTurn"];
  dispose: () => void | Promise<void>;
};

export type AgentServiceApplicationOptions = {
  loadRuntime: () => AgentServiceRuntime | Promise<AgentServiceRuntime>;
  onError?: (error: unknown) => void;
};

/** One service owns one lazy runtime; transport adapters only speak Request/Response. */
export function createAgentServiceApplication(options: AgentServiceApplicationOptions) {
  let closed = false;
  let runtime: AgentServiceRuntime | undefined;
  let loading: Promise<AgentServiceRuntime> | undefined;
  let disposing: Promise<void> | undefined;

  const report = (error: unknown) => {
    try { options.onError?.(error); } catch { /* Diagnostics cannot change ownership. */ }
  };
  const disposeRuntime = (owned: AgentServiceRuntime) =>
    disposing ??= Promise.resolve().then(() => owned.dispose());
  const getRuntime = () => loading ??= Promise.resolve().then(options.loadRuntime).then((owned) => {
    runtime = owned;
    // Initialization can finish after shutdown. It must never revive the service.
    if (closed) void disposeRuntime(owned).catch(report);
    return owned;
  });
  const unavailable = () => Response.json({ error: "Agent service is stopped" }, { status: 503 });
  const chat = createAgentChatHandler({
    runTurn: async (body, context) => {
      if (closed) return unavailable();
      const owned = await getRuntime();
      context.abortSignal.throwIfAborted();
      if (closed) return unavailable();
      return owned.runTurn(body, context);
    },
    onError: options.onError,
  });

  return {
    async handle(request: Request): Promise<Response> {
      if (closed) return unavailable();
      const path = new URL(request.url).pathname;
      if (path === "/health") {
        if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
        return Response.json({
          ok: true,
          service: "quicker-agent",
          protocolVersion: AGENT_SERVICE_PROTOCOL_VERSION,
          capabilities: ["chat"],
          runtime: runtime ? "loaded" : "lazy",
        });
      }
      if (path === "/api/chat") {
        if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
        return chat(request);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
    /** Stop the transport and settle requests before closing runtime storage. */
    dispose(): Promise<void> {
      closed = true;
      return runtime ? disposeRuntime(runtime) : Promise.resolve();
    },
  };
}
