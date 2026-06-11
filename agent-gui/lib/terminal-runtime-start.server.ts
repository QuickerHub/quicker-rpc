import { NextResponse } from "next/server";

/** Lazy-start Node terminal-runtime (dev + bundled QuickerAgent). */
export async function startTerminalRuntimeHandler() {
  if (process.env.AGENT_GUI_SKIP_TERMINAL_RUNTIME === "1") {
    return NextResponse.json(
      {
        ok: false,
        message: "terminal runtime disabled (AGENT_GUI_SKIP_TERMINAL_RUNTIME=1)",
      },
      { status: 503 },
    );
  }

  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  const {
    checkTerminalRuntimeHealth,
    ensureTerminalRuntime,
    resolveTerminalPort,
  } = await import("@/lib/terminal-runtime-lifecycle.mjs");

  const port = resolveTerminalPort();
  const base = `http://${host}:${port}`;

  const child = await ensureTerminalRuntime(process.cwd(), host);
  if (!(await checkTerminalRuntimeHealth(base))) {
    return NextResponse.json(
      {
        ok: false,
        message:
          `terminal runtime not ready at ${base}. `
          + "Ensure node-pty is installed (pnpm install).",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    reused: !child,
    started: Boolean(child),
    base,
    port,
  });
}
