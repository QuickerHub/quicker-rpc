/** Result from POST /api/designer/text-tool (qkrpc designer.textTool). */
export type QkrpcTextToolRunResult = {
  ok: boolean;
  cancelled?: boolean;
  value?: string;
  message?: string;
};

export type RunQkrpcTextToolOutcome =
  | { status: "success"; value: string }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

function readPayloadMessage(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const root = parsed as Record<string, unknown>;
  const msg = root.message ?? root.errorMessage ?? root.error;
  return typeof msg === "string" && msg.trim().length > 0 ? msg.trim() : undefined;
}

/**
 * Invoke Quicker native text tool via qkrpc plugin.
 * Returns unavailable when Quicker/qkrpc is offline (503).
 */
export async function runQkrpcTextTool(
  toolId: string,
  currentValue?: string,
): Promise<RunQkrpcTextToolOutcome> {
  const id = toolId.trim();
  if (!id) {
    return { status: "error", message: "toolId is empty" };
  }

  let response: Response;
  try {
    response = await fetch("/api/designer/text-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolId: id,
        currentValue: currentValue ?? "",
      }),
    });
  } catch {
    return { status: "unavailable" };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (response.status === 503) {
    return { status: "unavailable" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { status: "error", message: "Invalid text-tool response." };
  }

  const body = parsed as Record<string, unknown>;
  if (body.ok !== true) {
    return {
      status: "error",
      message: readPayloadMessage(parsed) ?? `Text tool failed (${response.status}).`,
    };
  }

  if (body.cancelled === true) {
    return { status: "cancelled" };
  }

  const value = typeof body.value === "string" ? body.value : "";
  if (!value.trim()) {
    return { status: "cancelled" };
  }

  return { status: "success", value };
}
