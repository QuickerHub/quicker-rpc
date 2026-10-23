import type { ChatPostBody } from "../agent-harness/types";
import { RELEASE_PREVIEW_COOKIE } from "../release-preview-constants";
import { runWithReleasePreview } from "../release-preview-context";

export type AgentChatHandlerServices = {
  runTurn: (
    body: ChatPostBody,
    options: { abortSignal: AbortSignal },
  ) => Response | Promise<Response>;
  onError?: (error: unknown) => void;
};

/** Match the existing cookie adapter: exact name, last valid decoded value. */
function readReleasePreview(request: Request): boolean {
  let preview = false;
  for (const pair of (request.headers.get("cookie") ?? "").split(/; */)) {
    const separator = pair.indexOf("=");
    const name = separator < 0 ? pair : pair.slice(0, separator);
    if (name !== RELEASE_PREVIEW_COOKIE) continue;
    try {
      preview = separator >= 0 && decodeURIComponent(pair.slice(separator + 1)) === "1";
    } catch {
      // Malformed encoding must not turn on preview or erase an earlier value.
    }
  }
  return preview;
}

/** Standard HTTP adapter; the injected runner owns validation and the AI SDK stream. */
export function createAgentChatHandler({ runTurn, onError }: AgentChatHandlerServices) {
  return async (request: Request): Promise<Response> => {
    try {
      return await runWithReleasePreview(readReleasePreview(request), async () => {
        request.signal.throwIfAborted();
        const body = (await request.json()) as ChatPostBody;
        request.signal.throwIfAborted();
        return runTurn(body, { abortSignal: request.signal });
      });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      try { onError?.(error); } catch { /* Reporting cannot replace the HTTP error. */ }
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
