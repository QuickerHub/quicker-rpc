import { NextResponse } from "next/server";
import {
  parseLlmProbeConfigSource,
  parseLlmProbeMethod,
  probeAllLlmEndpoints,
} from "@/lib/llm-endpoint-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = parseLlmProbeConfigSource(url.searchParams.get("source"));
  const method = parseLlmProbeMethod(url.searchParams.get("method"));
  const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? "12000");
  const includeAuto = url.searchParams.get("includeAuto") !== "false";

  try {
    const report = await probeAllLlmEndpoints({
      source,
      method,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 12_000,
      includeAutoModels: includeAuto,
    });
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
