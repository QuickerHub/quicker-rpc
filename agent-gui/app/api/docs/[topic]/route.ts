import { getActionAuthoringDoc } from "@/lib/action-authoring-docs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ topic: string }> },
) {
  const { topic } = await ctx.params;
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
  });
}
