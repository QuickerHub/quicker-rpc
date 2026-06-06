export const DEFAULT_BROWSER_HOST = "127.0.0.1";
export const DEFAULT_BROWSER_PORT = 6017;

export function resolveBrowserPort(): number {
  const raw =
    process.env.QUICKER_BROWSER_PORT?.trim()
    ?? process.env.AGENT_GUI_BROWSER_PORT?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_BROWSER_PORT;
}

export function resolveBrowserHost(): string {
  return process.env.QUICKER_BROWSER_HOST?.trim() || DEFAULT_BROWSER_HOST;
}

export function buildBrowserHealthUrl(
  host = resolveBrowserHost(),
  port = resolveBrowserPort(),
): string {
  return `http://${host}:${port}/health`;
}

export function buildBrowserInvokeUrl(
  host = resolveBrowserHost(),
  port = resolveBrowserPort(),
): string {
  return `http://${host}:${port}/v1/invoke`;
}
