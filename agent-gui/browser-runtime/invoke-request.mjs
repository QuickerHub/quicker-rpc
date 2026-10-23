import { invokeError } from "./protocol.mjs";

function readBody(req, signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const cleanup = () => {
      req.removeListener("data", data);
      req.removeListener("end", end);
      req.removeListener("error", error);
      signal.removeEventListener("abort", abort);
    };
    const data = (chunk) => chunks.push(Buffer.from(chunk));
    const end = () => { cleanup(); resolve(Buffer.concat(chunks).toString("utf8")); };
    const error = (reason) => { cleanup(); reject(reason); };
    const abort = () => error(signal.reason);
    req.on("data", data);
    req.once("end", end);
    req.once("error", error);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** The HTTP connection owns this invoke, never the shared browser/session. */
export async function handleBrowserInvokeRequest(req, res, invoke, sendJson) {
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException("Browser request disconnected", "AbortError"));
  const onResponseClose = () => { if (!res.writableEnded) abort(); };
  req.once("aborted", abort);
  res.once("close", onResponseClose);
  res.once("error", abort);
  if (req.aborted || res.destroyed) abort();
  const send = (status, body) => {
    if (!controller.signal.aborted && !res.destroyed && !res.writableEnded) sendJson(res, status, body);
  };
  try {
    let body;
    try {
      body = JSON.parse(await readBody(req, controller.signal));
    } catch {
      send(400, invokeError("Invalid JSON body"));
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      send(400, invokeError("Body must be a JSON object"));
      return;
    }
    const op = String(body.op ?? "").trim();
    if (!op) {
      send(400, invokeError("op is required"));
      return;
    }
    const sessionId = String(body.sessionId ?? "default").trim() || "default";
    const args = body.args && typeof body.args === "object" ? body.args : {};
    controller.signal.throwIfAborted();
    const result = await invoke(op, args, sessionId, { abortSignal: controller.signal });
    send(result.ok ? 200 : 502, result);
  } catch (error) {
    send(502, invokeError(error instanceof Error ? error.message : String(error)));
  } finally {
    req.removeListener("aborted", abort);
    res.removeListener("close", onResponseClose);
    res.removeListener("error", abort);
  }
}
