import { createAgentChatHandler, type AgentChatHandlerServices } from "./chat-handler";
import { isAgentApiPath } from "./api-router";

export const AGENT_SERVICE_PROTOCOL_VERSION = 1;

export type AgentServiceRuntime = {
  runTurn: AgentChatHandlerServices["runTurn"];
  handleRequest?: (request: Request) => Promise<Response>;
  dispose: () => void | Promise<void>;
};

export type AgentServiceApplicationOptions = {
  loadRuntime: () => AgentServiceRuntime | Promise<AgentServiceRuntime>;
  onError?: (error: unknown) => void;
  serveRenderer?: (request: Request) => Promise<Response>;
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
          capabilities: ["chat", "http-api", ...(options.serveRenderer ? ["renderer"] : [])],
          runtime: runtime ? "loaded" : "lazy",
        });
      }
      if (path === "/api/chat") {
        if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
        return chat(request);
      }
      if (isAgentApiPath(path)) {
        try {
          const owned = await getRuntime();
          request.signal.throwIfAborted();
          if (closed) return unavailable();
          if (owned.handleRequest) return await owned.handleRequest(request);
        } catch (error) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          report(error);
          return Response.json({ error: "Agent API request failed" }, { status: 500 });
        }
      } else if (options.serveRenderer) {
        return options.serveRenderer(request);
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
