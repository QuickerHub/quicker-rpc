import {
  analyzeChatThreadExportJson,
  analyzeChatThreadExportText,
  formatSessionAnalysisReport,
} from "@/lib/agent-session-analysis";
import { ChatThreadExportParseError } from "@/lib/agent-session-analysis/parse-export";

export const runtime = "nodejs";

type SessionAnalysisRequest = {
  payload?: unknown;
  exportText?: string;
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    format: "quicker-agent-chat-export",
    method: "POST",
    body: { exportText: "string (full export JSON text)" },
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }

  let body: SessionAnalysisRequest;
  try {
    body = (await req.json()) as SessionAnalysisRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const result =
      typeof body.exportText === "string" && body.exportText.trim()
        ? analyzeChatThreadExportText(body.exportText)
        : analyzeChatThreadExportJson(body.payload);

    const report = formatSessionAnalysisReport(result);
    return Response.json({
      ok: true,
      report,
      matchedTaskId: result.matchedTask?.id ?? null,
      traceRubricPassed: result.trace.traceRubric.passed,
      toolCallCount: result.trace.metrics.toolCallCount,
      findingCount: result.trace.findings.length,
    });
  } catch (error) {
    if (error instanceof ChatThreadExportParseError) {
      return Response.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ ok: false, error: "INVALID_EXPORT_JSON" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
