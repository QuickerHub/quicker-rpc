export type ActionCommandOp = "run" | "edit" | "float" | "delete" | "set-metadata";

export type ActionCommandBody = {
  op: ActionCommandOp;
  id: string;
  param?: string;
  debug?: boolean;
  wait?: boolean;
  title?: string;
  description?: string;
  expectedEditVersion?: number;
};

/** Quicker library has no such action — safe to skip RPC delete and remove workspace project only. */
export function isQuickerActionMissingError(error: string): boolean {
  const text = error.trim();
  if (!text) return false;
  if (/action not found/i.test(text)) return true;
  if (/action page not found/i.test(text)) return true;
  if (/未找到.*动作|动作.*不存在|找不到.*动作/i.test(text)) return true;
  return false;
}

export async function invokeActionCommand(
  body: ActionCommandBody,
): Promise<{ ok: true; data?: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/actions/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      data?: unknown;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: data.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed") || message.includes("Failed to fetch")) {
      return {
        ok: false,
        error: "无法连接动作 API（请确认 agent-gui 已启动且页面未在热重载中）",
      };
    }
    return { ok: false, error: message || "动作命令请求失败" };
  }
}
