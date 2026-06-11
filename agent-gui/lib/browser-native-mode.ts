/** Server-side: native embedded WebView instead of Playwright browser-runtime. */
export function isNativeEmbeddedBrowserEnabled(): boolean {
  const mode = process.env.BROWSER_AUTOMATION_MODE?.trim().toLowerCase();
  if (mode === "playwright") return false;
  return true;
}
