import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import type { BrowserPanelInteractResponse } from "@/lib/browser-panel-types";
import { browserPanelPatchFromData } from "@/lib/browser-panel-patch";

export { browserPanelPatchFromData };

export async function postBrowserPanelAction(
  body: Record<string, unknown>,
): Promise<BrowserPanelInteractResponse> {
  const res = await fetch("/api/browser/panel", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as BrowserPanelInteractResponse;
}

const PREVIEW_ACTIONS = new Set(["navigate", "reload", "back", "forward"]);

/** Run panel action; optionally chain screenshot when navigation returns no preview image. */
export async function runBrowserPanelAction(
  body: Record<string, unknown>,
  sessionId: string,
  options?: { capturePreview?: boolean },
): Promise<{
  ok: boolean;
  patch: Partial<BrowserPanelSnapshot> | null;
  message?: string;
}> {
  const result = await postBrowserPanelAction(body);
  if (!result.ok) {
    return { ok: false, patch: null, message: result.message };
  }

  let patch = browserPanelPatchFromData(result.data);
  const action = typeof body.action === "string" ? body.action : "";
  const capturePreview = options?.capturePreview ?? false;
  if (capturePreview && PREVIEW_ACTIONS.has(action) && !patch?.previewBase64) {
    const shot = await postBrowserPanelAction({
      action: "screenshot",
      sessionId,
    });
    if (shot.ok) {
      patch = {
        ...patch,
        ...browserPanelPatchFromData(shot.data),
      };
    }
  }

  return { ok: true, patch };
}
