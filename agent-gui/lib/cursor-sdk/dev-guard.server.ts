import "server-only";


/** Cursor SDK UI/runtime is dev-only; release builds must not expose or spawn it. */
export function isCursorSdkDevEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Block API handlers in production (404 — route treated as absent). */
export function cursorSdkDevOnlyResponse(): Response | null {
  if (isCursorSdkDevEnabled()) return null;
  return Response.json({ error: "Not found" }, { status: 404 });
}
