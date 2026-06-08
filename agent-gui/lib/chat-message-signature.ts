import type { AgentUIMessage } from "@/lib/chat-types";

const snapshotSignatureCache = new WeakMap<AgentUIMessage[], string>();

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function primitiveSignature(value: unknown): string {
  if (typeof value === "string") return `s${value.length}:${hashString(value)}`;
  if (typeof value === "number" || typeof value === "boolean") {
    return `${typeof value}:${String(value)}`;
  }
  if (value == null) return "null";
  return typeof value;
}

function objectPartSignature(part: Record<string, unknown>): string {
  const keys = Object.keys(part).sort();
  const pieces: string[] = [];
  for (const key of keys) {
    const value = part[key];
    if (typeof value === "string") {
      pieces.push(`${key}=s${value.length}:${hashString(value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      try {
        const json = JSON.stringify(value);
        pieces.push(`${key}=a${value.length}:${hashString(json)}`);
      } catch {
        pieces.push(`${key}=a${value.length}`);
      }
      continue;
    }
    if (typeof value === "object" && value !== null) {
      try {
        const json = JSON.stringify(value);
        pieces.push(`${key}=o${json.length}:${hashString(json)}`);
      } catch {
        pieces.push(`${key}=object`);
      }
      continue;
    }
    pieces.push(`${key}=${primitiveSignature(value)}`);
  }

  return pieces.join(",");
}

function messagePartSignature(part: unknown): string {
  if (typeof part !== "object" || part === null) {
    return primitiveSignature(part);
  }
  return objectPartSignature(part as Record<string, unknown>);
}

export function chatMessagesSignature(messages: AgentUIMessage[]): string {
  const cached = snapshotSignatureCache.get(messages);
  if (cached) return cached;

  const pieces: string[] = [`n${messages.length}`];
  for (const message of messages) {
    pieces.push(message.id, message.role, `p${message.parts.length}`);
    for (const part of message.parts) {
      pieces.push(messagePartSignature(part));
    }
  }

  const signature = pieces.join("|");
  snapshotSignatureCache.set(messages, signature);
  return signature;
}

/** True when message snapshots are equivalent for persistence/render-store purposes. */
export function chatMessagesEqual(
  a: AgentUIMessage[],
  b: AgentUIMessage[],
): boolean {
  return a === b || chatMessagesSignature(a) === chatMessagesSignature(b);
}
