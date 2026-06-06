import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildBrowserHealthUrl,
  buildBrowserInvokeUrl,
  resolveBrowserHost,
  resolveBrowserPort,
} from "@/lib/browser-config";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

export type BrowserInvokeResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

let spawnAttempted = false;

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

async function waitForBrowserRuntimeHealth(maxMs = 45_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await checkBrowserRuntimeHealth(2500)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`browser runtime did not become ready at ${buildBrowserHealthUrl()}`);
}

function resolveBrowserRuntimeDir(): string | null {
  const agentGuiRoot = join(process.cwd());
  const sibling = join(agentGuiRoot, "..", "browser-runtime");
  if (existsSync(join(sibling, "pyproject.toml"))) {
    return sibling;
  }
  const repoRoot = resolveQuickerRpcRepoRoot();
  if (repoRoot) {
    const fromRepo = join(repoRoot, "browser-runtime");
    if (existsSync(join(fromRepo, "pyproject.toml"))) {
      return fromRepo;
    }
  }
  return null;
}

async function trySpawnBrowserRuntimeDev(): Promise<boolean> {
  if (spawnAttempted) return false;
  if (process.env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") return false;
  if (process.env.NODE_ENV !== "development") return false;

  const runtimeDir = resolveBrowserRuntimeDir();
  if (!runtimeDir) return false;

  spawnAttempted = true;
  const host = resolveBrowserHost();
  const port = resolveBrowserPort();

  return new Promise((resolve) => {
    const child = spawn(
      "uv",
      ["run", "quicker-browser-runtime", "--host", host, "--port", String(port)],
      {
        cwd: runtimeDir,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          QUICKER_BROWSER_HOST: host,
          QUICKER_BROWSER_PORT: String(port),
        },
      },
    );

    child.stdout?.on("data", (chunk) => {
      const line = chunk.toString().trimEnd();
      if (line) console.log(`[browser] ${line}`);
    });
    child.stderr?.on("data", (chunk) => {
      const line = chunk.toString().trimEnd();
      if (line) console.error(`[browser] ${line}`);
    });
    child.on("error", () => resolve(false));

    waitForBrowserRuntimeHealth()
      .then(() => resolve(true))
      .catch(() => {
        child.kill();
        resolve(false);
      });
  });
}

export async function ensureBrowserRuntimeReady(): Promise<void> {
  if (await checkBrowserRuntimeHealth()) return;
  const spawned = await trySpawnBrowserRuntimeDev();
  if (spawned && (await checkBrowserRuntimeHealth())) return;

  throw new Error(
    "Browser runtime is not running. Start it with: pnpm browser:dev-server "
    + `(or uv run --directory ../browser-runtime quicker-browser-runtime). Expected ${buildBrowserHealthUrl()}`,
  );
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
