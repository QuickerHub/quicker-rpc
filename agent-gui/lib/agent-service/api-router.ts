import { agentApiRoutes } from "./api-routes.generated";
import { readReleasePreview } from "./chat-handler";
import { runWithReleasePreview } from "../release-preview-context";
import { runWithAgentRequestContextAsync } from "../qkrpc-request-context";

export type ApiRoute = {
  path: string;
  methods: readonly string[];
  load: () => Promise<unknown>;
};
type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

export function isAgentApiPath(path: string): boolean {
  if (path.startsWith("/ActionDesignerIcons/")) return true;
  const segments = path.replace(/\/$/, "").split("/");
  return agentApiRoutes.some((route) => {
    const expected = route.path.split("/");
    return expected.length === segments.length && expected.every((part, index) => part.startsWith("[") || part === segments[index]);
  });
}

/** Existing handlers, params and SSE bodies run unchanged behind either HTTP host. */
export function createAgentApiRouter(routes: readonly ApiRoute[]) {
  const entries = routes.map((route) => ({ ...route, segments: route.path.split("/") }));
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ActionDesignerIcons/")) {
      url.searchParams.set("path", url.pathname.slice("/ActionDesignerIcons/".length));
      url.pathname = "/api/icons/res";
      request = new Request(url, request);
    }
    const segments = url.pathname.replace(/\/$/, "").split("/");
    const params: Record<string, string> = {};
    const match = entries.find((entry) => {
      if (entry.segments.length !== segments.length) return false;
      return entry.segments.every((segment, index) => segment.startsWith("[") || segment === segments[index]);
    });
    if (!match) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      match.segments.forEach((segment, index) => {
        if (segment.startsWith("[")) params[segment.slice(1, -1)] = decodeURIComponent(segments[index]);
      });
    } catch {
      return Response.json({ error: "Invalid route parameter" }, { status: 400 });
    }
    const method = request.method === "HEAD" && match.methods.includes("GET") ? "GET" : request.method;
    if (!match.methods.includes(method)) {
      return new Response(null, { status: 405, headers: { allow: match.methods.join(", ") } });
    }
    request.signal.throwIfAborted();
    const module = await match.load() as Record<string, Handler>;
    request.signal.throwIfAborted();
    return runWithAgentRequestContextAsync({ abortSignal: request.signal }, () =>
      runWithReleasePreview(readReleasePreview(request), () => module[method](request, { params: Promise.resolve(params) })));
  };
}

export const handleAgentApiRequest = createAgentApiRouter(agentApiRoutes);
