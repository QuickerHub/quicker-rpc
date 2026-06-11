export const DEFAULT_EMBEDDED_BROWSER_HOST = "127.0.0.1";
export const DEFAULT_EMBEDDED_BROWSER_PORT = 6018;

export function resolveEmbeddedBrowserHost(): string {
  return (
    process.env.QUICKER_EMBEDDED_BROWSER_HOST?.trim()
    ?? process.env.AGENT_GUI_EMBEDDED_BROWSER_HOST?.trim()
    ?? DEFAULT_EMBEDDED_BROWSER_HOST
  );
}

export function resolveEmbeddedBrowserPort(): number {
  const raw =
    process.env.QUICKER_EMBEDDED_BROWSER_PORT?.trim()
    ?? process.env.AGENT_GUI_EMBEDDED_BROWSER_PORT?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_EMBEDDED_BROWSER_PORT;
}

export function buildEmbeddedBrowserHealthUrl(
  host = resolveEmbeddedBrowserHost(),
  port = resolveEmbeddedBrowserPort(),
): string {
  return `http://${host}:${port}/health`;
}

export function buildEmbeddedBrowserInvokeUrl(
  host = resolveEmbeddedBrowserHost(),
  port = resolveEmbeddedBrowserPort(),
): string {
  return `http://${host}:${port}/v1/invoke`;
}
