export const DEFAULT_BROWSER_HOST = "127.0.0.1";
export const DEFAULT_BROWSER_PORT = 6017;

/** WebSocket URL for the Playwright panel stream (client-side). */
export function buildBrowserPanelWsUrl(
  host = DEFAULT_BROWSER_HOST,
  port = DEFAULT_BROWSER_PORT,
): string {
  return `ws://${host}:${port}/v1/panel/ws`;
}
