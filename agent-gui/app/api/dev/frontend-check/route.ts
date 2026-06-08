import { NextResponse } from "next/server";
import { runFrontendSmokeCheck } from "@/lib/dev-frontend-smoke.server";
import {
  clearClientFrontendErrors,
  clearFrontendBuildError,
} from "@/lib/dev-frontend-error-store.server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(req.url);
  const baseUrl = url.searchParams.get("baseUrl") ?? undefined;
  if (url.searchParams.get("clearCaptured") === "true") {
    clearClientFrontendErrors();
    clearFrontendBuildError();
  }
  const result = await runFrontendSmokeCheck({ baseUrl: baseUrl ?? undefined });

  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
