import { NextResponse } from "next/server";
import {
  getVoiceModelDownloadState,
  isVoiceModelInstalled,
  isVoiceModelPartial,
  startVoiceModelDownload,
} from "@/lib/voice-plugin-install.server";

export const runtime = "nodejs";

function devOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  const state = getVoiceModelDownloadState();
  return NextResponse.json({
    standard: isVoiceModelInstalled("standard"),
    lightweight: isVoiceModelInstalled("lightweight"),
    standardPartial: isVoiceModelPartial("standard"),
    lightweightPartial: isVoiceModelPartial("lightweight"),
    inFlight: state.inFlight,
    error: state.error,
    progress: state.progress,
  });
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    preset?: string;
    force?: boolean;
  };
  const preset =
    body.preset === "paraformer" || body.preset === "lightweight"
      ? "paraformer"
      : "sensevoice";

  const started = startVoiceModelDownload(preset, { force: body.force === true });
  if (!started.ok) {
    return NextResponse.json(
      { ok: false, error: started.error ?? "无法开始下载" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    started: true,
    preset,
    ...getVoiceModelDownloadState(),
  });
}
