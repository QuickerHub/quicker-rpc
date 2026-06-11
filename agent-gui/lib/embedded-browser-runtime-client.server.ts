import {
  buildEmbeddedBrowserHealthUrl,
  buildEmbeddedBrowserInvokeUrl,
  resolveEmbeddedBrowserHost,
} from "@/lib/embedded-browser-config";

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
): Promise<boolean> {
  const url = buildEmbeddedBrowserHealthUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      ok?: boolean;
      protocolVersion?: string;
    };
    return (
      body.ok === true
      && body.protocolVersion === EMBEDDED_BROWSER_PROTOCOL_VERSION
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForEmbeddedBrowserRuntimeHealth(
  maxWaitMs = 8_000,
  pollMs = 300,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkEmbeddedBrowserRuntimeHealth(Math.min(pollMs + 500, 2_000))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
}

/**
 * Returns true when the Electron embedded-browser automation HTTP server is reachable.
 * First probe may wait briefly while Electron finishes booting; result is cached.
 */
export async function isEmbeddedBrowserRuntimeAvailable(): Promise<boolean> {
  if (nativeRuntimeAvailabilityCache === false) {
    return false;
  }
  if (nativeRuntimeAvailabilityCache === true) {
    if (await checkEmbeddedBrowserRuntimeHealth(1_500)) {
      return true;
    }
    nativeRuntimeAvailabilityCache = null;
  }

  if (await checkEmbeddedBrowserRuntimeHealth(2_000)) {
    nativeRuntimeAvailabilityCache = true;
    return true;
  }

  const ready = await waitForEmbeddedBrowserRuntimeHealth(8_000, 300);
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
): Promise<EmbeddedBrowserInvokeResult> {
  if (!(await isEmbeddedBrowserRuntimeAvailable())) {
    return {
      ok: false,
      message:
        `Native embedded browser automation is not reachable at ${buildEmbeddedBrowserHealthUrl()}.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildEmbeddedBrowserInvokeUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op, args, sessionId }),
      cache: "no-store",
    });
    const body = (await res.json()) as EmbeddedBrowserInvokeResult;
    if (!body.ok) {
      return body;
    }
    return body;
  } catch (err) {
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
