import { startTerminalRuntimeHandler } from "@/lib/terminal-runtime-start.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return startTerminalRuntimeHandler(request);
}

export async function POST(request: Request) {
  return startTerminalRuntimeHandler(request);
}
