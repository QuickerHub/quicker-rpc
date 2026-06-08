import type { AgentUIMessage } from "@/lib/chat-types";

/** Compact signature for scroll/window hooks — avoids unstable array deps. */
export function buildChatScrollRevisionKey(
  messages: AgentUIMessage[],
  status: string,
  error: Error | undefined,
): string {
  const last = messages[messages.length - 1];
  let tailSig = "";
  if (last?.parts) {
    const chunks: string[] = [];
    for (const part of last.parts) {
      if (part.type === "text") {
        chunks.push(`t${part.text.length}`);
      } else if (part.type === "reasoning") {
        const text = "text" in part && typeof part.text === "string" ? part.text : "";
        chunks.push(`r${text.length}`);
      } else {
        chunks.push(part.type);
      }
    }
    tailSig = chunks.join(",");
  }
  return `${messages.length}|${status}|${error?.message ?? ""}|${last?.id ?? ""}|${tailSig}`;
}
