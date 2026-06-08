import { fetchLlmEndpointModels } from "@/lib/llm-list-models";
import { getCustomProfile } from "@/lib/llm-profiles";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";

export const dynamic = "force-dynamic";

type ListModelsBody = {
  baseURL?: string;
  apiKey?: string;
  profileId?: string;
};

export async function POST(req: Request) {
  return withReleasePreviewRoute(async () => {
    let body: ListModelsBody;
    try {
      body = (await req.json()) as ListModelsBody;
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const baseURL = typeof body.baseURL === "string" ? body.baseURL.trim() : "";
    if (!baseURL) {
      return Response.json({ ok: false, error: "baseURL is required" }, { status: 400 });
    }

    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey && typeof body.profileId === "string" && body.profileId.trim()) {
      const profile = getCustomProfile(body.profileId.trim());
      apiKey = profile?.apiKey.trim() ?? "";
    }

    const result = await fetchLlmEndpointModels(baseURL, apiKey);
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, status: result.status },
        { status: result.status && result.status >= 400 && result.status < 600
          ? result.status
          : 502 },
      );
    }

    return Response.json({ ok: true, models: result.models });
  });
}
