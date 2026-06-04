import { generateId } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

type ToolPart = AgentUIMessage["parts"][number];

export function createRunningToolPart(
  toolName: string,
  input: unknown,
  toolCallId?: string,
): ToolPart {
  const id = toolCallId ?? generateId();
  return {
    type: `tool-${toolName}` as ToolPart["type"],
    toolCallId: id,
    state: "input-available",
    input,
  } as ToolPart;
}

export function toolPartToSuccess(
  part: ToolPart,
  output: unknown,
): ToolPart {
  return {
    ...part,
    state: "output-available",
    output,
  } as ToolPart;
}

export function toolPartToError(
  part: ToolPart,
  errorText: string,
): ToolPart {
  return {
    ...part,
    state: "output-error",
    errorText,
  } as ToolPart;
}

export function createUserTestMessage(text: string): AgentUIMessage {
  return {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text }],
  };
}

export function createAssistantToolMessage(
  parts: ToolPart[],
): AgentUIMessage {
  return {
    id: generateId(),
    role: "assistant",
    parts,
  };
}

export function updateAssistantMessageParts(
  messages: AgentUIMessage[],
  assistantId: string,
  parts: ToolPart[],
): AgentUIMessage[] {
  return messages.map((m) =>
    m.id === assistantId ? { ...m, parts } : m,
  );
}
