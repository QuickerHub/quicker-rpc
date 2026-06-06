import { startBrowserRuntimeHandler } from "@/lib/browser-runtime-start.server";

export const runtime = "nodejs";

/** @deprecated Prefer POST /api/browser/runtime */
export async function POST() {
  return startBrowserRuntimeHandler();
}
