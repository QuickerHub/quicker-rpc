import { NextResponse } from "next/server";

/** Lazy-start Node browser-runtime (dev + bundled QuickerAgent). */
export async function startBrowserRuntimeHandler() {
  if (process.env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") {
    return NextResponse.json(
      { ok: false, message: "browser runtime disabled (AGENT_GUI_SKIP_BROWSER_RUNTIME=1)" },
      { status: 503 },
    );
  }

  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  const {
    checkBrowserRuntimeHealth,
    ensureBrowserRuntime,
    resolveBrowserPort,
  } = await import("@/lib/browser-runtime-lifecycle.mjs");

  const port = resolveBrowserPort();
  const base = `http://${host}:${port}`;

  if (await checkBrowserRuntimeHealth(base)) {
    return NextResponse.json({ ok: true, reused: true, base });
  }

  const child = await ensureBrowserRuntime(process.cwd(), host);
  if (!child && !(await checkBrowserRuntimeHealth(base))) {
    return NextResponse.json(
      {
        ok: false,
        message:
          `browser runtime not ready at ${base}. `
          + "Run: pnpm browser:install && pnpm browser:dev-server",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, started: true, base });
}
