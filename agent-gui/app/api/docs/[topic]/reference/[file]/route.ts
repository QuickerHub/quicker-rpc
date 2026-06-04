import { getActionAuthoringReference } from "@/lib/action-authoring-docs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ topic: string; file: string }> },
) {
  const { topic, file } = await ctx.params;
  const result = await getActionAuthoringReference(topic, file);
  if (!result.ok) {
    return Response.json(
      {
        success: false,
        errorMessage: result.error,
        availableTopics: result.availableTopics,
        availableReferences: result.availableReferences,
      },
      { status: 404 },
    );
  }
  return Response.json({
    success: true,
    topic: result.doc.topic,
    reference: result.doc.reference,
    title: result.doc.title,
    markdown: result.doc.markdown,
  });
}
