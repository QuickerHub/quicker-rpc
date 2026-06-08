import { NextResponse } from "next/server";

export const runtime = "nodejs";

function devOnly() {
  if (process.env.NODE_ENV === "development") return null;
  return NextResponse.json({ ok: false, message: "dev only" }, { status: 403 });
}

/** Dev-only: stop tracked voice runtime. */
export async function DELETE() {
  const blocked = devOnly();
  if (blocked) return blocked;

  const { stopVoiceRuntime, resolveVoicePort } = await import(
    "@/lib/voice-runtime-lifecycle.mjs"
  );
  stopVoiceRuntime(process.cwd());
  return NextResponse.json({ ok: true, port: resolveVoicePort() });
}

/** Dev-only: start quicker-voice-runtime on demand (avoids loading ASR model at dev boot). */
export async function POST() {
  const blocked = devOnly();
  if (blocked) return blocked;

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
