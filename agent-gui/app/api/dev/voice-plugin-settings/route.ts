import { NextResponse } from "next/server";
import {
  readVoicePluginSettingsFile,
  writeVoicePluginSettingsFile,
  type VoicePluginSettingsFile,
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
  return NextResponse.json(readVoicePluginSettingsFile());
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as Partial<VoicePluginSettingsFile>;
  const current = readVoicePluginSettingsFile();
  const next: VoicePluginSettingsFile = {
    ...current,
    ...body,
    gpuAcceleration: body.gpuAcceleration === true,
  };
  writeVoicePluginSettingsFile(next);
  return NextResponse.json(next);
}
