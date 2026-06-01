import {
  listActionAuthoringTopics,
  searchActionAuthoringDocs,
} from "@/lib/action-authoring-docs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  if (query != null && query.trim() !== "") {
    const search = await searchActionAuthoringDocs(
      query,
      Number.isFinite(limit) ? limit : 10,
    );
    return Response.json({ success: true, action: "docs-search", ...search });
  }

  const topics = await listActionAuthoringTopics();
  return Response.json({ success: true, action: "docs-index", topics });
}
