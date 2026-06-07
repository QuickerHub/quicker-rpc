/** Temporarily disabled — re-enable when clipboard-history runtime is stable. */
export const CLIPBOARD_HISTORY_ENABLED = false;

export const CLIPBOARD_HISTORY_DISABLED_MESSAGE =
  "剪贴板历史功能已暂时关闭，不影响系统剪贴板正常使用。";

export const CLIPBOARD_HISTORY_PLUGIN_ID = "clipboard-history";

export const DEFAULT_CLIPBOARD_HTTP_HOST = "127.0.0.1";
export const DEFAULT_CLIPBOARD_HTTP_PORT = 6020;

export function resolveClipboardHttpPort(): number {
  const raw =
    process.env.QUICKER_CLIPBOARD_PORT?.trim() ||
    process.env.AGENT_GUI_CLIPBOARD_PORT?.trim() ||
    process.env.NEXT_PUBLIC_QUICKER_CLIPBOARD_PORT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_CLIPBOARD_HTTP_PORT;
}

export function clipboardHistoryBaseUrl(port = resolveClipboardHttpPort()): string {
  return `http://${DEFAULT_CLIPBOARD_HTTP_HOST}:${port}`;
}
