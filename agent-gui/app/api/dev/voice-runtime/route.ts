import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Dev-only: start quicker-voice-runtime on demand (avoids loading ASR model at dev boot). */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, message: "dev only" }, { status: 403 });
  }

  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  const {
    checkVoiceRuntimeHealth,
    ensureVoiceRuntime,
    resolveVoicePort,
  } = await import("@/lib/voice-runtime-lifecycle.mjs");

  const port = resolveVoicePort();
  const base = `http://${host}:${port}`;

  if (await checkVoiceRuntimeHealth(base)) {
    return NextResponse.json({ ok: true, reused: true, base });
  }

  const child = await ensureVoiceRuntime(process.cwd(), host);
  if (!child && !(await checkVoiceRuntimeHealth(base))) {
    return NextResponse.json(
      { ok: false, message: `voice runtime not ready at ${base}` },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, started: true, base });
}
