/** Tracks tool calls that already triggered explorer auto-open (survives remounts). */
const openedAutoOpenKeys = new Set<string>();

export function buildWorkspaceToolAutoOpenKey(
  toolCallId: string | undefined,
  messageId: string | undefined,
  partIndex: number,
): string {
  const callId = toolCallId?.trim();
  if (callId) return `call:${callId}`;
  const msgId = messageId?.trim();
  if (msgId) return `part:${msgId}:${partIndex}`;
  return `part:idx:${partIndex}`;
}

export function markWorkspaceToolAutoOpened(key: string): boolean {
  const id = key.trim();
  if (!id || openedAutoOpenKeys.has(id)) {
    return false;
  }
  openedAutoOpenKeys.add(id);
  return true;
}

export function readToolCallId(part: unknown): string | undefined {
  if (typeof part !== "object" || part === null) return undefined;
  const id = (part as { toolCallId?: unknown }).toolCallId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}
