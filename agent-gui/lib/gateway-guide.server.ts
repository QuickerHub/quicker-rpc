import "server-only";

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { DocsGetDoc, GatewayGuideKnowledge } from "./docs-tool";
import { currentQkrpcTarget } from "./qkrpc-host-binding";
import { invokeQkrpcHttp, resolveQkrpcHttpBase } from "./qkrpc-http";
import { isCliTransportForced } from "./qkrpc-transport";
import { resolveQkrpcCliBinary, runQkrpcCliDirect } from "./qkrpc";
import { executeSingleQkrpcToolCall } from "./qkrpc-tool-call";
import { isQkrpcConnectivityBlockedThisTurn, markQkrpcConnectivityBlockedThisTurn } from "./qkrpc-connectivity-gate";
import { resolveRequestAbortSignal } from "./request-abort-signal";
import type { QkrpcRunResult } from "./qkrpc-types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }

function metadataKnown(codec: Record<string, unknown> | null, provenance: Record<string, unknown> | null): boolean {
  const source = record(codec?.source);
  const formats = record(codec?.formats);
  const origin = record(provenance?.source);
  return codec?.schemaVersion === 1 && source?.provider === "qkrpc.program-source-codec" && source.kind === "local-codec" && source.identityStatus === "known"
    && [source.provider, source.assemblyName, source.assemblyVersion, source.informationalVersion, source.moduleVersionId, codec.descriptorRevision].every(text)
    && Array.isArray(formats?.inputs) && formats.inputs.length > 0 && formats.inputs.every(text) && text(formats.output)
    && provenance?.schemaVersion === 1 && origin?.provider === "qkrpc.guide" && origin.kind === "bundled-fallback"
    && [origin.provider, origin.assemblyName, origin.bundleVersion, provenance.indexRevision, provenance.contentRevision].every(text);
}

function identity(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function displayHttpBase(base: string): string {
  try { const url = new URL(base); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.toString().replace(/\/$/, ""); }
  catch { return "HTTP gateway (invalid address)"; }
}

/** A single explicit gateway read: no host discovery, recovery, retries or fallback. */
export async function readGatewayProgramSourceGuide(options?: { abortSignal?: AbortSignal }): Promise<DocsGetDoc> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const target = currentQkrpcTarget();
  const cli = target ? target.gateway === "cli" : isCliTransportForced();
  const binary = cli ? resolveQkrpcCliBinary({ readOnly: true }) : null;
  const selected = cli ? (binary ? resolve(binary) : null) : target?.gateway ?? resolveQkrpcHttpBase();
  const gateway: GatewayGuideKnowledge["gateway"] = {
    transport: cli ? "cli" : "http",
    identity: identity(`${cli ? "cli" : "http"}:${selected ?? "unresolved"}`),
    displayName: cli ? `Local qkrpc CLI${selected ? "" : " (unavailable)"}` : displayHttpBase(selected!),
  };
  let result: QkrpcRunResult | null;
  try {
    result = await executeSingleQkrpcToolCall(["guide", "get", "--topic", "program-source"], { abortSignal, timeoutMs: 10_000 }, {
      isConnectivityBlocked: isQkrpcConnectivityBlockedThisTurn,
      markConnectivityBlocked: markQkrpcConnectivityBlockedThisTurn,
      run: async (args, runOptions) => cli
        ? runQkrpcCliDirect(args, { ...runOptions, binaryPath: selected })
        : (await invokeQkrpcHttp({ op: "guide.get", args: { topic: "program-source" } }, { ...runOptions, gatewayBase: selected! }))
          ?? { ok: false, exitCode: 1, stdout: "", stderr: "Gateway unavailable", parsed: null, truncated: false },
    });
  } catch {
    abortSignal?.throwIfAborted();
    result = null;
  }
  abortSignal?.throwIfAborted();
  const payload = record(result?.parsed);
  const usable = result?.ok === true && !result.truncated && payload?.success === true && payload.ok !== false
    && payload.topic === "program-source" && text(payload.markdown);
  const codec = usable ? record(payload.codec) : null;
  const provenance = usable ? record(payload.provenance) : null;
  const status = !usable ? "unavailable" : metadataKnown(codec, provenance) ? "available" : "unknown";
  return {
    topic: "program-source", title: usable && text(payload.title) ? payload.title : "Program source",
    markdown: usable ? payload.markdown as string : "", guideSource: "gateway",
    gatewayKnowledge: { status, gateway, retrievedAt: new Date().toISOString(), codec, provenance,
      ...(status === "unavailable" ? { reason: "The selected gateway did not return a usable program-source guide. No local guide or other gateway was substituted." }
        : status === "unknown" ? { reason: "This gateway did not provide recognized complete codec and guide provenance metadata. Native support remains unknown." } : {}),
    },
  };
}
