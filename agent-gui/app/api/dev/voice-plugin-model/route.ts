import { NextResponse } from "next/server";
import {
  downloadVoiceAsrModel,
  getVoiceModelDownloadState,
  isVoiceModelInstalled,
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
  return NextResponse.json({
    standard: isVoiceModelInstalled("standard"),
    lightweight: isVoiceModelInstalled("lightweight"),
    ...getVoiceModelDownloadState(),
  });
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { preset?: string };
  const preset =
    body.preset === "paraformer" || body.preset === "lightweight"
      ? "paraformer"
      : "sensevoice";

  try {
    await downloadVoiceAsrModel(preset);
    return NextResponse.json({
      ok: true,
      preset,
      standard: isVoiceModelInstalled("standard"),
      lightweight: isVoiceModelInstalled("lightweight"),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "模型下载失败",
      },
      { status: 500 },
    );
  }
}
