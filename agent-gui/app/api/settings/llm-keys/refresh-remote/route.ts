import {
  getRemotePublishConfigStatus,
  refreshRemotePublishConfig,
} from "@/lib/llm-remote-publish-config";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";

export const dynamic = "force-dynamic";

export async function POST() {
  return withReleasePreviewRoute(async () => {
    const result = await refreshRemotePublishConfig({ force: true });
    const status = getRemotePublishConfigStatus();

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error,
          remotePublishConfig: status,
        },
        { status: 502 },
      );
    }

    return Response.json({
      ok: true,
      changed: result.changed,
      remotePublishConfig: status,
    });
  });
}
