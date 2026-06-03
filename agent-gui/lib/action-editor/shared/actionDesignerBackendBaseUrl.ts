/** agent-gui uses same-origin Next.js API routes; no cross-origin DesignerHost. */
export function getActionDesignerBackendBaseUrl(): string {
  return "";
}

export async function ensureActionDesignerBackendBaseResolved(): Promise<string> {
  return "";
}

export function isAppDebugBarVisible(): boolean {
  return false;
}
