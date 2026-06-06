export type BrowserPanelSnapshot = {
  sessionId: string;
  url: string;
  title: string;
  previewBase64: string | null;
  previewMimeType: string | null;
  viewportWidth: number;
  viewportHeight: number;
  updatedAt: number;
};

export const EMPTY_BROWSER_PANEL_SNAPSHOT: BrowserPanelSnapshot = {
  sessionId: "default",
  url: "",
  title: "",
  previewBase64: null,
  previewMimeType: null,
  viewportWidth: 1280,
  viewportHeight: 800,
  updatedAt: 0,
};

export type BrowserPanelInteractRequest = {
  action: "navigate" | "back" | "forward" | "reload" | "click_xy" | "screenshot";
  sessionId?: string;
  url?: string;
  x?: number;
  y?: number;
};

export type BrowserPanelInteractResponse = {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
};
