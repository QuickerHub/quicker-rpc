import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { isStructuredToolResult } from "@/lib/tool-result";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Normalize browser runtime / panel API payloads into panel snapshot fields. */
export function browserPanelPatchFromData(
  raw: unknown,
): Partial<BrowserPanelSnapshot> | null {
  const data = asRecord(raw);
  if (!data) return null;

  const patch: Partial<BrowserPanelSnapshot> = {
    updatedAt: Date.now(),
  };

  const sessionId = pickString(data, "sessionId");
  if (sessionId) patch.sessionId = sessionId;

  const url = pickString(data, "url");
  if (url) patch.url = url;

  const title = pickString(data, "title");
  if (title) patch.title = title;

  const previewBase64 =
    pickString(data, "previewBase64") ?? pickString(data, "base64");
  if (previewBase64) {
    patch.previewBase64 = previewBase64;
    patch.previewMimeType =
      pickString(data, "previewMimeType")
      ?? pickString(data, "mimeType")
      ?? "image/jpeg";
  }

  const viewportWidth = data.viewportWidth;
  if (typeof viewportWidth === "number" && viewportWidth > 0) {
    patch.viewportWidth = viewportWidth;
  }
  const viewportHeight = data.viewportHeight;
  if (typeof viewportHeight === "number" && viewportHeight > 0) {
    patch.viewportHeight = viewportHeight;
  }

  if (!patch.url && !patch.previewBase64 && !patch.title) return null;
  return patch;
}

/** Extract nested payload from structured browser tool results. */
export function browserPanelPatchFromToolOutput(
  output: unknown,
): Partial<BrowserPanelSnapshot> | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  return browserPanelPatchFromData(output.data);
}
