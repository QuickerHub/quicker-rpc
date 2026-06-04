export type SubProgramCommandOp = "delete";

export type SubProgramCommandBody = {
  op: SubProgramCommandOp;
  id: string;
};

/** Quicker library has no such subprogram — safe to skip RPC delete. */
export function isQuickerSubProgramMissingError(error: string): boolean {
  const text = error.trim();
  if (!text) return false;
  if (/global subprogram not found/i.test(text)) return true;
  if (/subprogram not found/i.test(text)) return true;
  if (/未找到.*子程序|子程序.*不存在|找不到.*子程序/i.test(text)) return true;
  return false;
}

export async function invokeSubProgramCommand(
  body: SubProgramCommandBody,
): Promise<{ ok: true; data?: unknown } | { ok: false; error: string }> {
  const res = await fetch("/api/subprogram/command", {
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
}
