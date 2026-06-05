import { getManagedLlmUsageSnapshot } from "@/lib/llm-usage-tracker.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
    const snapshot = await getManagedLlmUsageSnapshot({
      forceRefreshAccount: forceRefresh,
    });
    return Response.json({
      ok: true,
      account: snapshot.account,
      identity: snapshot.identity,
      tracked: snapshot.tracked,
      usage: snapshot.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
