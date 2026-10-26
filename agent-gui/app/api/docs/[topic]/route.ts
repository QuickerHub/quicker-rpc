import { getActionAuthoringDoc } from "@/lib/action-authoring-docs";
import { readGatewayProgramSourceGuide } from "@/lib/gateway-guide.server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ topic: string }> },
) {
  const { topic } = await ctx.params;
  const source = new URL(req.url).searchParams.get("source") ?? "local";
  if (source !== "local" && source !== "gateway") {
    return Response.json({ success: false, errorMessage: "Unknown guide source." }, { status: 400 });
  }
  if (source === "gateway") {
    if (topic !== "program-source") return Response.json({ success: false, errorMessage: "Gateway guides support only program-source." }, { status: 400 });
    const doc = await readGatewayProgramSourceGuide({ abortSignal: req.signal });
    const success = doc.gatewayKnowledge?.status !== "unavailable";
    return Response.json({ success, ...doc }, { status: success ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  const result = await getActionAuthoringDoc(topic);
  if (!result.ok) {
    return Response.json(
      {
        success: false,
        errorMessage: result.error,
        availableTopics: result.availableTopics,
      },
      { status: 404 },
    );
  }

  return Response.json({
    success: true,
    topic: result.doc.topic,
    title: result.doc.title,
    markdown: result.doc.markdown,
    guideSource: "local",
  });
}
