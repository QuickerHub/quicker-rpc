import { NextResponse } from "next/server";
import {
  evaluateSettingsIntentCase,
  summarizeSettingsIntentBatch,
  type SettingsResolvePayload,
} from "@/lib/quicker-settings-intent-check";
import {
  flattenSettingsIntentCases,
  type SettingsIntentCase,
} from "@/lib/quicker-settings-intent-cases";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export const runtime = "nodejs";

type ResolveHttpData = SettingsResolvePayload & { action?: string };

async function resolveCase(testCase: SettingsIntentCase): Promise<{
  resolve?: SettingsResolvePayload;
  error?: string;
}> {
  const via = testCase.resolveVia ?? "query";
  const args =
    via === "preset"
      ? { preset: testCase.utterance }
      : via === "key"
        ? { key: testCase.utterance }
        : { query: testCase.utterance };

  const result = await invokeQkrpcHttp(
    { op: "settings.resolve", args },
    { timeoutMs: 60_000 },
  );

  if (!result) {
    return { error: "qkrpc serve unavailable (http://127.0.0.1:9477)" };
  }

  if (!result.ok) {
    return {
      error:
        typeof result.stderr === "string" && result.stderr.trim()
          ? result.stderr.trim()
          : "settings resolve failed",
    };
  }

  const data = result.parsed as ResolveHttpData | null | undefined;
  if (!data || typeof data !== "object") {
    return { error: "Invalid settings resolve response" };
  }

  return { resolve: data };
}

async function runCases(cases: SettingsIntentCase[]) {
  const results = [];
  for (const testCase of cases) {
    const { resolve, error } = await resolveCase(testCase);
    results.push(evaluateSettingsIntentCase(testCase, resolve, error));
  }
  return summarizeSettingsIntentBatch(results);
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId")?.trim();
  const allCases = flattenSettingsIntentCases();
  const cases = caseId
    ? allCases.filter((c) => c.id === caseId)
    : allCases;

  if (cases.length === 0) {
    return NextResponse.json(
      { ok: false, error: caseId ? `Unknown caseId: ${caseId}` : "No cases" },
      { status: 400 },
    );
  }

  const summary = await runCases(cases);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: { utterance?: string; caseId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const utterance = body.utterance?.trim();
  if (utterance) {
    const { resolve, error } = await resolveCase({
      id: "custom",
      label: "自定义",
      utterance,
      resolveVia: "query",
      expect: { intent: "" },
    });
    return NextResponse.json({
      ok: !error && resolve?.ok !== false,
      utterance,
      resolve,
      error,
    });
  }

  const caseId = body.caseId?.trim();
  const allCases = flattenSettingsIntentCases();
  const testCase = caseId
    ? allCases.find((c) => c.id === caseId)
    : undefined;

  if (caseId && !testCase) {
    return NextResponse.json(
      { ok: false, error: `Unknown caseId: ${caseId}` },
      { status: 400 },
    );
  }

  if (testCase) {
    const { resolve, error } = await resolveCase(testCase);
    const result = evaluateSettingsIntentCase(testCase, resolve, error);
    return NextResponse.json(result, { status: result.pass ? 200 : 503 });
  }

  const summary = await runCases(allCases);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
