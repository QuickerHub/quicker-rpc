import {
  buildBrowserHealthUrl,
  buildBrowserInvokeUrl,
  resolveBrowserHost,
  resolveBrowserPort,
} from "@/lib/browser-config";

export type BrowserInvokeResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

let ensureInFlight: Promise<void> | null = null;

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

export async function checkBrowserRuntimeHealth(timeoutMs = 3000): Promise<boolean> {
  const url = buildBrowserHealthUrl();
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
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function startBrowserRuntime(): Promise<void> {
  if (process.env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") {
    throw new Error("Browser runtime disabled (AGENT_GUI_SKIP_BROWSER_RUNTIME=1)");
  }

  const lifecycle = await import("@/lib/browser-runtime-lifecycle.mjs");
  const host = resolveBrowserHost();
  const port = resolveBrowserPort();
  const base = `http://${host}:${port}`;

  if (await lifecycle.checkBrowserRuntimeHealth(base)) return;

  await lifecycle.ensureBrowserRuntime(process.cwd(), host);
  if (!(await lifecycle.checkBrowserRuntimeHealth(base))) {
    throw new Error(`browser runtime did not become ready at ${base}/health`);
  }
}

export async function ensureBrowserRuntimeReady(): Promise<void> {
  if (await checkBrowserRuntimeHealth()) return;

  if (!ensureInFlight) {
    ensureInFlight = startBrowserRuntime().finally(() => {
      ensureInFlight = null;
    });
  }
  await ensureInFlight;

  if (!(await checkBrowserRuntimeHealth())) {
    throw new Error(
      "Browser runtime is not running. Start it with: pnpm browser:dev-server "
      + `(Expected ${buildBrowserHealthUrl()})`,
    );
  }
}

export async function invokeBrowserRuntime(
  op: string,
  args: Record<string, unknown> = {},
  sessionId = "default",
  timeoutMs = 120_000,
): Promise<BrowserInvokeResult> {
  await ensureBrowserRuntimeReady();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildBrowserInvokeUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op, args, sessionId }),
      cache: "no-store",
    });
    const body = (await res.json()) as BrowserInvokeResult;
    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

export function browserRuntimeBaseUrl(): string {
  return normalizeBase(buildBrowserHealthUrl().replace(/\/health$/, ""));
}
