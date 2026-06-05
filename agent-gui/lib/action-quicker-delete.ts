import {
  invokeActionCommand,
  isQuickerActionMissingError,
} from "@/lib/action-command-client";

export async function deleteActionInQuicker(
  actionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokeActionCommand({ op: "delete", id: actionId });
  if (result.ok) {
    return { ok: true };
  }
  if (isQuickerActionMissingError(result.error ?? "")) {
    return { ok: false, error: "Quicker 中未找到该动作" };
  }
  return { ok: false, error: result.error ?? "删除失败" };
}
