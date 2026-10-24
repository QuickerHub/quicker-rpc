import { startBrowserRuntimeHandler } from "@/lib/browser-runtime-start.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return startBrowserRuntimeHandler(request);
}
