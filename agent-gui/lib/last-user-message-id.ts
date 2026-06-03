/** Id of the last user message in the thread (only this prompt may pin). */
export function getLastUserMessageId(
  messages: ReadonlyArray<{ id: string; role: string }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") return message.id;
  }
  return null;
}
