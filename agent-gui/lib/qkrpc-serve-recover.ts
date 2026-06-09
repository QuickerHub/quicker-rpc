import { invalidateServeProbeCache } from "@/lib/qkrpc-transport";

/** Best-effort: start bundled qkrpc serve when /health is unreachable. */
export async function tryEnsureQkrpcServe(): Promise<void> {
  if (process.env.AGENT_GUI_SKIP_QKRPC === "1") {
    return;
  }
  try {
    const { ensureQkrpcServeIfDown } = await import("@/lib/qkrpc-serve-ensure.mjs");
    await ensureQkrpcServeIfDown();
    invalidateServeProbeCache();
  } catch {
    // recovery is optional
  }
}
