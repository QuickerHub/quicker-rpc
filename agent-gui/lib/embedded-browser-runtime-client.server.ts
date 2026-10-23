import {
  buildEmbeddedBrowserHealthUrl,
  buildEmbeddedBrowserInvokeUrl,
  resolveEmbeddedBrowserHost,
} from "@/lib/embedded-browser-config";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import { awaitBrowserRequest, waitForBrowserPoll } from "@/lib/browser/request";

export const EMBEDDED_BROWSER_PROTOCOL_VERSION = "quicker-embedded-browser-v1";

export type EmbeddedBrowserInvokeResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

/** Cached after first probe in this Next.js process — avoids repeated waits when Electron is absent. */
let nativeRuntimeAvailabilityCache: boolean | null = null;

export function resetEmbeddedBrowserRuntimeAvailabilityCache(): void {
  nativeRuntimeAvailabilityCache = null;
}

export async function checkEmbeddedBrowserRuntimeHealth(
  timeoutMs = 2_000,
  explicitSignal?: AbortSignal,
): Promise<boolean> {
  const abortSignal = resolveRequestAbortSignal(explicitSignal);
  abortSignal?.throwIfAborted();
  const url = buildEmbeddedBrowserHealthUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;
  try {
    const res = await awaitBrowserRequest(fetch(url, {
      method: "GET",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    }), signal);
    signal.throwIfAborted();
    if (!res.ok) return false;
    const body = (await awaitBrowserRequest(res.json(), signal)) as {
      ok?: boolean;
      protocolVersion?: string;
    };
    signal.throwIfAborted();
    return (
      body.ok === true
      && body.protocolVersion === EMBEDDED_BROWSER_PROTOCOL_VERSION
    );
  } catch {
    abortSignal?.throwIfAborted();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForEmbeddedBrowserRuntimeHealth(
  maxWaitMs = 8_000,
  pollMs = 300,
  explicitSignal?: AbortSignal,
): Promise<boolean> {
  const signal = resolveRequestAbortSignal(explicitSignal);
  signal?.throwIfAborted();
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const ready = await checkEmbeddedBrowserRuntimeHealth(Math.min(pollMs + 500, 2_000), signal);
    signal?.throwIfAborted();
    if (ready) {
      return true;
    }
    await waitForBrowserPoll(pollMs, signal);
  }
  return false;
}

/**
 * Returns true when the Electron embedded-browser automation HTTP server is reachable.
 * First probe may wait briefly while Electron finishes booting; result is cached.
 */
export async function isEmbeddedBrowserRuntimeAvailable(explicitSignal?: AbortSignal): Promise<boolean> {
  const signal = resolveRequestAbortSignal(explicitSignal);
  signal?.throwIfAborted();
  if (nativeRuntimeAvailabilityCache === false) {
    return false;
  }
  if (nativeRuntimeAvailabilityCache === true) {
    const cachedReady = await checkEmbeddedBrowserRuntimeHealth(1_500, signal);
    signal?.throwIfAborted();
    if (cachedReady) {
      return true;
    }
    nativeRuntimeAvailabilityCache = null;
  }

  const initialReady = await checkEmbeddedBrowserRuntimeHealth(2_000, signal);
  signal?.throwIfAborted();
  if (initialReady) {
    nativeRuntimeAvailabilityCache = true;
    return true;
  }

  const ready = await waitForEmbeddedBrowserRuntimeHealth(8_000, 300, signal);
  signal?.throwIfAborted();
  nativeRuntimeAvailabilityCache = ready;
  return ready;
}

export function isEmbeddedBrowserRuntimeUnreachableMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("fetch failed")
    || lower.includes("econnrefused")
    || lower.includes("automation server")
    || lower.includes("not reachable")
    || lower.includes("quickeragent desktop")
  );
}

export function shouldFallbackToPlaywrightBrowserResult(
  result: EmbeddedBrowserInvokeResult,
): boolean {
  if (result.ok) return false;
  const text = `${result.message ?? ""} ${result.error ?? ""}`;
  if (isEmbeddedBrowserRuntimeUnreachableMessage(text)) {
    return true;
  }
  const lower = text.toLowerCase();
  return lower.includes("webview is not mounted");
}

export async function invokeEmbeddedBrowserRuntime(
  op: string,
  args: Record<string, unknown> = {},
  sessionId = "default",
  timeoutMs = 120_000,
  options?: { abortSignal?: AbortSignal },
): Promise<EmbeddedBrowserInvokeResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const available = await isEmbeddedBrowserRuntimeAvailable(abortSignal);
  abortSignal?.throwIfAborted();
  if (!available) {
    return {
      ok: false,
      message:
        `Native embedded browser automation is not reachable at ${buildEmbeddedBrowserHealthUrl()}.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;
  try {
    signal.throwIfAborted();
    const res = await awaitBrowserRequest(fetch(buildEmbeddedBrowserInvokeUrl(), {
      method: "POST",
      signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op, args, sessionId }),
      cache: "no-store",
    }), signal);
    signal.throwIfAborted();
    const body = (await awaitBrowserRequest(res.json(), signal)) as EmbeddedBrowserInvokeResult;
    signal.throwIfAborted();
    if (!body.ok) {
      return body;
    }
    return body;
  } catch (err) {
    abortSignal?.throwIfAborted();
    nativeRuntimeAvailabilityCache = null;
    const message = err instanceof Error ? err.message : String(err);
    const host = resolveEmbeddedBrowserHost();
    return {
      ok: false,
      message:
        `${message}. Native embedded browser automation requires QuickerAgent desktop (Electron). `
        + `Expected ${host} automation server at ${buildEmbeddedBrowserHealthUrl()}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}
