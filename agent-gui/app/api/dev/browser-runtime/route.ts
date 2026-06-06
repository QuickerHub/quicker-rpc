import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Dev-only: start Node browser-runtime on demand. */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, message: "dev only" }, { status: 403 });
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
      { ok: false, message: `browser runtime not ready at ${base}` },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, started: true, base });
}
