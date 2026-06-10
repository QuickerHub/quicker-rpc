import { isStructuredToolResult } from "@/lib/tool-result";

type BrowserToolInputLike = {
  action: string;
  url?: string;
  ref?: string;
  key?: string;
  fullPage?: boolean;
};

/** Binary preview fields — for side panel / WebSocket only, never for the LLM. */
const BINARY_PREVIEW_KEYS = [
  "previewBase64",
  "base64",
  "previewMimeType",
  "mimeType",
] as const;

export type BrowserToolAudience = "agent" | "panel";

export type BrowserToolResultView = {
  action: string;
  sessionId?: string;
  url?: string;
  title?: string;
  snapshot?: string;
  nodeCount?: number;
  ref?: string;
  key?: string;
  status?: number | null;
  panelPreview?: boolean;
  text?: string;
  truncated?: boolean;
  tabs?: Array<{ index: number; url: string; title: string; active: boolean }>;
  tabCount?: number;
  browserReady?: boolean;
  sessionCount?: number;
  navigated?: boolean;
  openedTab?: boolean;
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Remove screenshot blobs from runtime payload before returning to the agent. */
export function sanitizeBrowserToolDataForAgent(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const hadPreview = Boolean(raw.previewBase64 || raw.base64);
  const out = { ...raw };
  for (const key of BINARY_PREVIEW_KEYS) {
    delete out[key];
  }
  if (hadPreview) {
    out.panelPreview = true;
  }
  return out;
}

export function parseBrowserToolResultView(
  output: unknown,
): BrowserToolResultView | null {
  if (!isStructuredToolResult(output)) return null;
  const data = asRecord(output.data);
  if (!data) return null;

  const view: BrowserToolResultView = {
    action: pickString(data, "action") ?? "browser",
    sessionId: pickString(data, "sessionId"),
    url: pickString(data, "url"),
    title: pickString(data, "title"),
    snapshot: pickString(data, "snapshot"),
    ref: pickString(data, "ref"),
    key: pickString(data, "key"),
    text: pickString(data, "text"),
  };

  if (typeof data.nodeCount === "number") view.nodeCount = data.nodeCount;
  if (typeof data.status === "number" || data.status === null) {
    view.status = data.status as number | null;
  }
  if (data.panelPreview === true) view.panelPreview = true;
  if (data.truncated === true) view.truncated = true;
  if (data.navigated === true) view.navigated = true;
  if (data.openedTab === true) view.openedTab = true;
  if (typeof data.browserReady === "boolean") view.browserReady = data.browserReady;
  if (typeof data.sessionCount === "number") view.sessionCount = data.sessionCount;
  if (!output.ok) {
    view.error = output.stderr ?? "browser action failed";
  }

  if (Array.isArray(data.tabs)) {
    const tabs = data.tabs
      .filter((tab): tab is Record<string, unknown> => typeof tab === "object" && tab !== null)
      .map((tab, index) => ({
        index: typeof tab.index === "number" ? tab.index : index,
        url: pickString(tab, "url") ?? "",
        title: pickString(tab, "title") ?? "",
        active: tab.active === true,
      }))
      .filter((tab) => tab.url || tab.title);
    if (tabs.length > 0) {
      view.tabs = tabs;
      view.tabCount = tabs.length;
    }
  }

  return view;
}

function readAction(input: unknown): string {
  const obj = asRecord(input);
  return pickString(obj ?? {}, "action") ?? "";
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}`.slice(0, 72);
  } catch {
    return url.slice(0, 72);
  }
}

/** One-line summary for chat tool cards. */
export function summarizeBrowserToolOutput(
  output: unknown,
  input?: unknown,
): string | null {
  const view = parseBrowserToolResultView(output);
  if (!view) return null;

  if (view.error) {
    return `失败 · ${view.error.slice(0, 80)}`;
  }

  const action = readAction(input) || view.action;

  switch (action) {
    case "status":
      return view.browserReady ? "browser-runtime 就绪" : "browser-runtime 未就绪";
    case "navigate":
      return view.url ? `打开 ${shortUrl(view.url)}` : "已导航";
    case "snapshot":
      return view.nodeCount != null
        ? `${view.nodeCount} 个可交互元素`
        : "页面快照";
    case "content":
      return view.text
        ? `页面文本 ${view.text.length} 字${view.truncated ? "（已截断）" : ""}`
        : "页面文本";
    case "click": {
      const base = view.ref ? `点击 ${view.ref}` : "已点击";
      if (view.openedTab) return `${base} · 新标签页`;
      if (view.navigated && view.url) return `${base} · ${shortUrl(view.url)}`;
      return base;
    }
    case "click_xy":
      return view.openedTab ? "坐标点击 · 新标签页" : "坐标点击";
    case "type":
      return view.ref ? `输入 ${view.ref}` : "已输入";
    case "fill":
      return view.ref ? `填充 ${view.ref}` : "已填充";
    case "press":
      return view.key ? `按键 ${view.key}` : "已按键";
    case "wait":
      return "等待完成";
    case "screenshot":
      return view.panelPreview ? "截图已更新侧栏预览" : "截图";
    case "tabs":
      return view.tabCount != null ? `${view.tabCount} 个标签页` : "标签页";
    case "tab":
      return view.url ? `切换标签页 · ${shortUrl(view.url)}` : "切换标签页";
    case "back":
      return view.url ? `后退 · ${shortUrl(view.url)}` : "后退";
    case "forward":
      return view.url ? `前进 · ${shortUrl(view.url)}` : "前进";
    case "reload":
      return view.url ? `刷新 · ${shortUrl(view.url)}` : "已刷新";
    case "close":
      return "会话已关闭";
    default:
      if (view.url) return shortUrl(view.url);
      return null;
  }
}

export function browserToolInputLabel(input: BrowserToolInputLike): string {
  switch (input.action) {
    case "navigate":
      return input.url?.trim() ? shortUrl(input.url.trim()) : "navigate";
    case "snapshot":
      return "snapshot";
    case "content":
      return "content";
    case "click":
    case "type":
    case "fill":
    case "wait":
      return input.ref?.trim() ? `${input.action} ${input.ref.trim()}` : input.action;
    case "press":
      return input.key?.trim() ? `press ${input.key.trim()}` : "press";
    case "tab":
      return "tab switch";
    case "screenshot":
      return input.fullPage ? "screenshot (full page)" : "screenshot";
    default:
      return input.action;
  }
}

/** Redact long base64 blobs when rendering stored tool JSON in the UI. */
export function redactBrowserBinaryFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactBrowserBinaryFields(item));
  }
  if (typeof value !== "object" || value === null) return value;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    if (
      (key === "previewBase64" || key === "base64")
      && typeof raw === "string"
      && raw.length > 80
    ) {
      out[key] = `<${key} omitted: ${raw.length} chars>`;
      continue;
    }
    out[key] = redactBrowserBinaryFields(raw);
  }
  return out;
}
