import { NextResponse } from "next/server";
import type { ClientFrontendErrorReport } from "@/lib/dev-frontend-types";
import {
  appendClientFrontendErrors,
  readClientFrontendErrors,
} from "@/lib/dev-frontend-error-store.server";

export const runtime = "nodejs";

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;

  return NextResponse.json({
    errors: readClientFrontendErrors(),
  });
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = Array.isArray(body)
    ? body
    : Array.isArray((body as { errors?: unknown }).errors)
      ? (body as { errors: ClientFrontendErrorReport[] }).errors
      : [body];

  const normalized: ClientFrontendErrorReport[] = [];
  for (const entry of incoming) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Partial<ClientFrontendErrorReport>;
    if (typeof item.message !== "string" || !item.message.trim()) continue;
    normalized.push({
      kind:
        item.kind === "console" || item.kind === "unhandledrejection"
          ? item.kind
          : "error",
      message: item.message.trim().slice(0, 4000),
      stack: typeof item.stack === "string" ? item.stack.slice(0, 8000) : undefined,
      source: typeof item.source === "string" ? item.source.slice(0, 500) : undefined,
      line: typeof item.line === "number" ? item.line : undefined,
      col: typeof item.col === "number" ? item.col : undefined,
      url: typeof item.url === "string" ? item.url.slice(0, 500) : "",
      at: typeof item.at === "string" ? item.at : new Date().toISOString(),
    });
  }

  const errors = appendClientFrontendErrors(normalized);
  return NextResponse.json({ ok: true, count: errors.length });
}
