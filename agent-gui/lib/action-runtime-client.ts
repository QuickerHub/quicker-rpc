export type ActionRuntimeInvokeOp =
  | "run"
  | "check"
  | "keys"
  | "validate"
  | "mockRun"
  | "mockProfilesList";

export type ActionRuntimeInvokeArgs = {
  xaction?: unknown;
  dir?: string;
  id?: string;
  param?: string;
  verboseHost?: boolean;
  mockProfile?: string;
  /** Default true for mockRun */
  assert?: boolean;
};

export type ActionRuntimeInvokeResult = {
  ok: boolean;
  op: ActionRuntimeInvokeOp;
  data?: unknown;
  error?: string;
  message?: string;
  durationMs: number;
};

function formatClientFetchError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("failed to fetch")) {
    return "无法连接 ActionRuntime API（agent-gui 开发服务）。请确认 pwsh ./dev.ps1 正在运行。";
  }
  return message;
}

export async function invokeActionRuntimeDev(
  op: ActionRuntimeInvokeOp,
  args: ActionRuntimeInvokeArgs = {},
  options?: { signal?: AbortSignal },
): Promise<ActionRuntimeInvokeResult> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch("/api/dev/action-runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, args }),
      signal: options?.signal,
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "请求失败";
    return {
      ok: false,
      op,
      error: "NETWORK_ERROR",
      message: formatClientFetchError(message),
      durationMs: Date.now() - started,
    };
  }

  let body: {
    ok?: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return {
      ok: false,
      op,
      error: "INVALID_RESPONSE",
      message: "ActionRuntime API returned non-JSON",
      durationMs: Date.now() - started,
    };
  }

  const message = body.message
    ? formatClientFetchError(body.message)
    : body.message;

  return {
    ok: body.ok === true && res.ok,
    op,
    data: body.data,
    error: body.error,
    message,
    durationMs: Date.now() - started,
  };
}
