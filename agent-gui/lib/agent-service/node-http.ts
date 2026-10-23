import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setMaxListeners } from "node:events";
import type { AddressInfo, Socket } from "node:net";
import { Readable } from "node:stream";

export type AgentHttpHandler = (request: Request) => Promise<Response>;

export interface AgentNodeHttpService {
  origin: string;
  address: AddressInfo;
  stop(): Promise<void>;
  whenSettled(): Promise<void>;
}

export class AgentNodeHttpStopTimeoutError extends Error {
  constructor(readonly pendingRequests: number, readonly pendingBodyCancels: number) {
    super(`Agent HTTP stop timed out (${pendingRequests} requests, ${pendingBodyCancels} body cancellations pending)`);
    this.name = "AgentNodeHttpStopTimeoutError";
  }
}

export interface AgentNodeHttpListener {
  (incoming: IncomingMessage, outgoing: ServerResponse): void;
  readonly pendingRequests: number;
  readonly pendingBodyCancels: number;
  waitForIdle(): Promise<void>;
}

const abortError = (message: string) => new DOMException(message, "AbortError");

function waitForDrain(response: ServerResponse, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off("drain", drained);
      signal.removeEventListener("abort", aborted);
    };
    const drained = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    response.once("drain", drained);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

/** Only adapts HTTP and stream ownership; routing and business bindings are injected. */
export function createAgentNodeHttpListener(
  handler: AgentHttpHandler,
  options: { signal?: AbortSignal } = {},
): AgentNodeHttpListener {
  const requests = new Set<Promise<void>>();
  const bodyCancels = new Set<Promise<void>>();
  const track = (pending: Promise<void>, collection: Set<Promise<void>>) => {
    collection.add(pending);
    void pending.finally(() => collection.delete(pending)).catch(() => {});
  };
  const cancelBody = (response: Response, reason: unknown) => {
    if (response.body) track(response.body.cancel(reason).catch(() => {}), bodyCancels);
  };
  const listener = (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const owner = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let finished = false;

    const releaseReader = (reason?: unknown) => {
      if (!reader) return;
      const current = reader;
      reader = undefined;
      if (reason !== undefined) track(current.cancel(reason).catch(() => {}), bodyCancels);
      // Releasing also rejects a pending read; a producer ignoring cancellation cannot hold stop().
      current.releaseLock();
    };
    const cleanup = () => {
      if (finished) return;
      finished = true;
      incoming.off("aborted", disconnected);
      incoming.off("error", failed);
      outgoing.off("close", closed);
      outgoing.off("finish", completed);
      outgoing.off("error", failed);
      options.signal?.removeEventListener("abort", stopped);
    };
    const abort = (reason: unknown, destroy = true) => {
      // Abort the producer before canceling an SDK/tee reader.
      if (!owner.signal.aborted) owner.abort(reason);
      releaseReader(owner.signal.reason);
      if (destroy) {
        cleanup();
        incoming.destroy();
        outgoing.destroy();
      }
    };
    const disconnected = () => abort(abortError("HTTP client disconnected"));
    const failed = (error: Error) => abort(error);
    const closed = () => { if (!outgoing.writableFinished) disconnected(); else cleanup(); };
    const completed = () => { releaseReader(); cleanup(); };
    const stopped = () => abort(options.signal?.reason ?? abortError("Agent HTTP service stopped"));

    incoming.on("aborted", disconnected);
    incoming.on("error", failed);
    outgoing.on("close", closed);
    outgoing.on("finish", completed);
    outgoing.on("error", failed);
    options.signal?.addEventListener("abort", stopped, { once: true });
    if (options.signal?.aborted || incoming.aborted || outgoing.destroyed) {
      stopped();
      return;
    }

    const run = async () => {
      const method = incoming.method ?? "GET";
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      }
      const url = new URL(incoming.url ?? "/", `http://${headers.get("host") ?? "localhost"}`);
      const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(incoming);
      const request = new Request(url, {
        method, headers, signal: owner.signal,
        ...(body ? { body: body as ReadableStream<Uint8Array>, duplex: "half" } : {}),
      } as RequestInit);
      const response = await handler(request);
      if (owner.signal.aborted) {
        cancelBody(response, owner.signal.reason);
        return;
      }
      const responseHeaders: Record<string, string | string[]> = Object.create(null);
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) responseHeaders["set-cookie"] = cookies;
      outgoing.writeHead(response.status, response.statusText, responseHeaders);
      outgoing.flushHeaders();
      if (!response.body || method === "HEAD") {
        if (response.body) cancelBody(response, "HEAD response has no HTTP body");
        outgoing.end();
        return;
      }
      reader = response.body.getReader();
      while (!owner.signal.aborted) {
        const chunk = await reader.read();
        if (owner.signal.aborted) return;
        if (chunk.done) {
          releaseReader();
          outgoing.end();
          return;
        }
        if (!outgoing.write(chunk.value)) await waitForDrain(outgoing, owner.signal);
      }
    };
    track(run().catch((error: unknown) => {
      if (owner.signal.aborted || outgoing.destroyed) return;
      abort(error, false);
      if (outgoing.headersSent) {
        outgoing.destroy();
        cleanup();
      } else {
        outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        outgoing.end("Internal Server Error");
      }
    }), requests);
  };
  return Object.defineProperties(listener, {
    pendingRequests: { get: () => requests.size },
    pendingBodyCancels: { get: () => bodyCancels.size },
    waitForIdle: { value: async () => {
      while (requests.size || bodyCancels.size) await Promise.allSettled([...requests, ...bodyCancels]);
    } },
  }) as AgentNodeHttpListener;
}

/** Starts one owned loopback listener; stop reports work exceeding its grace period. */
export async function startAgentNodeHttpService(
  handler: AgentHttpHandler,
  options: { host?: string; port?: number; stopGraceMs?: number } = {},
): Promise<AgentNodeHttpService> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const stopGraceMs = options.stopGraceMs ?? 2000;
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("Agent HTTP service requires a loopback host");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid Agent HTTP service port");
  if (!Number.isInteger(stopGraceMs) || stopGraceMs < 0 || stopGraceMs > 30_000) throw new Error("Invalid Agent HTTP stop grace period");
  const lifetime = new AbortController();
  setMaxListeners(0, lifetime.signal);
  const listener = createAgentNodeHttpListener(handler, { signal: lifetime.signal });
  const server = createServer(listener);
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(); });
  });
  const address = server.address() as AddressInfo;
  let stopping: Promise<void> | undefined;
  let settled: Promise<void> | undefined;
  const stop = () => {
    if (!stopping) {
      let resolveStop!: () => void;
      let rejectStop!: (error: unknown) => void;
      // Publish the promise before abort callbacks can reenter stop().
      stopping = new Promise<void>((resolve, reject) => { resolveStop = resolve; rejectStop = reject; });
      const closed = new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
      lifetime.abort(abortError("Agent HTTP service stopped"));
      for (const socket of sockets) socket.destroy();
      const timer = setTimeout(() => rejectStop(new AgentNodeHttpStopTimeoutError(
        listener.pendingRequests, listener.pendingBodyCancels,
      )), stopGraceMs);
      settled = Promise.all([closed, listener.waitForIdle()]).then(() => {});
      settled.then(resolveStop, rejectStop).finally(() => clearTimeout(timer));
    }
    return stopping;
  };
  return {
    address,
    origin: `http://${host === "::1" ? "[::1]" : host}:${address.port}`,
    stop,
    whenSettled() {
      void stop().catch(() => {});
      return settled!;
    },
  };
}
