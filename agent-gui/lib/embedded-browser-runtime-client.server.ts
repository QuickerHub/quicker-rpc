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

export async function invokeEmbeddedBrowserRuntime(
  op: string,
  args: Record<string, unknown> = {},
  sessionId = "default",
  timeoutMs = 120_000,
): Promise<EmbeddedBrowserInvokeResult> {
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
    return body;
  } catch (err) {
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
