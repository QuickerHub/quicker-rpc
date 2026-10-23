import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";
import {
  buildBrowserHealthUrl,
  buildBrowserInvokeUrl,
  resolveBrowserHost,
  resolveBrowserPort,
} from "@/lib/browser-config";
import {
  ensureBrowserRuntime,
  fetchBrowserRuntimeHealth,
  isBrowserRuntimeVersionCurrent,
} from "@/lib/browser-runtime-lifecycle.mjs";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import { awaitBrowserRequest } from "@/lib/browser/request";

export type BrowserInvokeResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

export async function checkBrowserRuntimeHealth(timeoutMs = 3000, explicitSignal?: AbortSignal): Promise<boolean> {
  const signal = resolveRequestAbortSignal(explicitSignal);
  signal?.throwIfAborted();
  const health = await awaitBrowserRequest(fetchBrowserRuntimeHealth(browserRuntimeBaseUrl(), timeoutMs, signal), signal);
  signal?.throwIfAborted();
  return health.ok && (!process.env.QUICKER_AGENT_RUNTIME_OWNER || health.runtimeOwner === process.env.QUICKER_AGENT_RUNTIME_OWNER);
}

async function startBrowserRuntime(): Promise<void> {
  if (process.env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") {
    throw new Error("Browser runtime disabled (AGENT_GUI_SKIP_BROWSER_RUNTIME=1)");
  }

  const host = resolveBrowserHost();
  const port = resolveBrowserPort();
  const base = runtimeHttpOrigin(host, port);

  const health = await fetchBrowserRuntimeHealth(base);
  if (isBrowserRuntimeVersionCurrent(health)) return;

  if (health.ok && !isBrowserRuntimeVersionCurrent(health)) {
    throw new Error("Browser runtime port belongs to another owner or incompatible runtime");
  }

  await ensureBrowserRuntime(process.cwd(), host);
  const ready = await fetchBrowserRuntimeHealth(base);
  if (!isBrowserRuntimeVersionCurrent(ready)) {
    throw new Error(`browser runtime did not become ready at ${base}/health`);
  }
}

/** Shared startup belongs to the service; cancelling a waiter must not stop another caller. */
export function createBrowserRuntimeReadiness(ports: {
  health: (signal?: AbortSignal) => ReturnType<typeof fetchBrowserRuntimeHealth>;
  start: () => Promise<void>;
}) {
  let ensureInFlight: Promise<void> | null = null;
  return async (signal?: AbortSignal): Promise<void> => {
    signal?.throwIfAborted();
    const health = await awaitBrowserRequest(ports.health(signal), signal);
    signal?.throwIfAborted();
    if (isBrowserRuntimeVersionCurrent(health)) return;
    if (!ensureInFlight) {
      ensureInFlight = ports.start().finally(() => { ensureInFlight = null; });
    }
    await awaitBrowserRequest(ensureInFlight, signal);
    signal?.throwIfAborted();
    const ready = await awaitBrowserRequest(ports.health(signal), signal);
    signal?.throwIfAborted();
    if (!isBrowserRuntimeVersionCurrent(ready)) {
      throw new Error("Browser runtime is not running. Start it with: pnpm browser:dev-server "
        + `(Expected ${buildBrowserHealthUrl()})`);
    }
  };
}

const waitForRuntime = createBrowserRuntimeReadiness({
  health: (signal) => fetchBrowserRuntimeHealth(browserRuntimeBaseUrl(), 3000, signal),
  start: startBrowserRuntime,
});

export async function ensureBrowserRuntimeReady(explicitSignal?: AbortSignal): Promise<void> {
  return waitForRuntime(resolveRequestAbortSignal(explicitSignal));
}

export async function invokeBrowserRuntime(
  op: string,
  args: Record<string, unknown> = {},
  sessionId = "default",
  timeoutMs = 120_000,
  options?: { abortSignal?: AbortSignal },
): Promise<BrowserInvokeResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  await ensureBrowserRuntimeReady(abortSignal);
  abortSignal?.throwIfAborted();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;
  try {
    signal.throwIfAborted();
    const res = await awaitBrowserRequest(fetch(buildBrowserInvokeUrl(), {
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
    const body = (await awaitBrowserRequest(res.json(), signal)) as BrowserInvokeResult;
    signal.throwIfAborted();
    return body;
  } catch (err) {
    abortSignal?.throwIfAborted();
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

export function browserRuntimeBaseUrl(): string {
  return normalizeBase(buildBrowserHealthUrl().replace(/\/health$/, ""));
}
