import { NextResponse } from "next/server";
import { runFrontendSmokeCheck } from "@/lib/dev-frontend-smoke.server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(req.url);
  const baseUrl = url.searchParams.get("baseUrl") ?? undefined;
  const result = await runFrontendSmokeCheck({ baseUrl: baseUrl ?? undefined });

  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
