import { NextResponse } from "next/server";
import {
  clearDevVoicePluginInstallError,
  getVoicePluginHostStatus,
  startDevVoicePluginInstall,
  type DevVoiceInstallOptions,
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
  return NextResponse.json(getVoicePluginHostStatus());
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as DevVoiceInstallOptions;
  const options: DevVoiceInstallOptions = {
    force: body.force === true,
    preferNetwork: body.preferNetwork === true,
  };

  clearDevVoicePluginInstallError();
  const result = startDevVoicePluginInstall(options);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "install failed" },
      { status: 409 },
    );
  }

  const status = getVoicePluginHostStatus();
  if (result.skipped) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      ...status,
      message:
        "插件已安装。若要测试网络下载，请勾选「强制网络下载」后点「重新安装」。",
    });
  }

  return NextResponse.json({ ok: true, skipped: false, ...status });
}
