import { NextResponse } from "next/server";
import {
  buildChatThreadExportFilename,
  serializeChatThreadExport,
} from "@/lib/chat-thread-export";
import {
  parseChatThreadExportPayload,
  writeChatThreadExportFile,
} from "@/lib/chat-thread-export.server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { payload?: unknown };
    const payload = parseChatThreadExportPayload(body.payload);
    const content = serializeChatThreadExport(payload);
    const filename = buildChatThreadExportFilename(
      payload.thread,
      Date.parse(payload.exportedAt),
    );
    const result = writeChatThreadExportFile(filename, content);
    return NextResponse.json({
      ok: true,
      path: result.path,
      filename,
      exportsDirectory: result.exportsDirectory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
