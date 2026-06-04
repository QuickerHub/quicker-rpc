import { executeQuickerToolDirect } from "@/lib/tool-execute.server";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const toolName = typeof o.toolName === "string" ? o.toolName : "";
  if (!toolName.trim()) {
    return Response.json({ error: "toolName is required" }, { status: 400 });
  }

  const result = await executeQuickerToolDirect({
    toolName,
    input: o.input,
    workingDirectory:
      typeof o.workingDirectory === "string" ? o.workingDirectory : undefined,
    approved: o.approved === true,
    toolCallId: typeof o.toolCallId === "string" ? o.toolCallId : undefined,
  });

  if ("needsApproval" in result) {
    return Response.json(result, { status: 409 });
  }
  if ("ok" in result && !result.ok) {
    return Response.json(result, { status: 422 });
  }
  if ("ok" in result && result.ok) {
    return Response.json(result);
  }
  return Response.json({ error: "Unexpected execute result" }, { status: 500 });
}
