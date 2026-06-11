import { startTerminalRuntimeHandler } from "@/lib/terminal-runtime-start.server";

export const runtime = "nodejs";

export async function GET() {
  return startTerminalRuntimeHandler();
}

export async function POST() {
  return startTerminalRuntimeHandler();
}
