import "server-only";

import type { DesignerContextSnapshot } from "@/lib/designer-context-types";
import { parseDesignerContext } from "@/lib/designer-context-parse";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import { runQkrpc } from "@/lib/qkrpc";

async function invokeDesignerContext(includeXAction: boolean) {
  const http = await invokeQkrpcHttp(
    {
      op: "designer.context",
      args: { includeXAction },
    },
    { timeoutMs: 12_000 },
  );
  if (http !== null) {
    return http;
  }
  const argv = ["designer", "context", "--json"];
  if (includeXAction) {
    argv.push("--include-xaction");
  }
  return runQkrpc(argv, { timeoutMs: 12_000 });
}

/** Live ActionDesigner windows via qkrpc (HTTP serve or CLI fallback). */
export async function fetchDesignerContextSnapshot(
  includeXAction = false,
): Promise<DesignerContextSnapshot> {
  const result = await invokeDesignerContext(includeXAction);
  if (!result.ok || result.parsed === null) {
    return {
      ok: false,
      message: result.stderr.trim() || "designer.context unavailable",
      designers: [],
    };
  }
  return parseDesignerContext(result.parsed);
}
