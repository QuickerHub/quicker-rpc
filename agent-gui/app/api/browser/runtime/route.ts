import { startBrowserRuntimeHandler } from "@/lib/browser-runtime-start.server";

export const runtime = "nodejs";

export async function POST() {
  return startBrowserRuntimeHandler();
}
