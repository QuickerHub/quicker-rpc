import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";
type BrowserRuntimeLifecycle = Pick<typeof import("@/lib/browser-runtime-lifecycle.mjs"),
  "checkBrowserRuntimeHealth" | "ensureBrowserRuntime" | "resolveBrowserPort">;

type BrowserRuntimeStartDependencies = {
  env?: NodeJS.ProcessEnv;
  cwd?: () => string;
  loadLifecycle?: () => Promise<BrowserRuntimeLifecycle>;
};

/** Lazy-start Node browser-runtime (dev + bundled QuickerAgent). */
export function createStartBrowserRuntimeHandler({
  env = process.env,
  cwd = () => process.cwd(),
  loadLifecycle = () => import("@/lib/browser-runtime-lifecycle.mjs"),
}: BrowserRuntimeStartDependencies = {}) {
  return async function startBrowserRuntimeHandler(): Promise<Response> {
    if (env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") {
      return Response.json(
        { ok: false, message: "browser runtime disabled (AGENT_GUI_SKIP_BROWSER_RUNTIME=1)" },
        { status: 503 },
      );
    }

    const host = env.HOSTNAME?.trim() || "127.0.0.1";
    const {
      checkBrowserRuntimeHealth,
      ensureBrowserRuntime,
      resolveBrowserPort,
    } = await loadLifecycle();

    const port = resolveBrowserPort();
    const base = runtimeHttpOrigin(host, port);

    if (await checkBrowserRuntimeHealth(base)) {
      return Response.json({ ok: true, reused: true, base });
    }

    const child = await ensureBrowserRuntime(cwd(), host);
    if (!child && !(await checkBrowserRuntimeHealth(base))) {
      return Response.json(
        {
          ok: false,
          message:
            `browser runtime not ready at ${base}. `
            + "Run: pnpm browser:install && pnpm browser:dev-server",
        },
        { status: 503 },
      );
    }

    return Response.json({ ok: true, started: true, base });
  };
}

export const startBrowserRuntimeHandler = createStartBrowserRuntimeHandler();
