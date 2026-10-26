import { createQuickerNativeMcpSettingsHandlers } from "@/lib/quicker-native-mcp-settings.server";

export const dynamic = "force-dynamic";
const handlers = createQuickerNativeMcpSettingsHandlers();

export async function GET(request: Request) { return handlers.GET(request); }
export async function POST(request: Request) { return handlers.POST(request); }
