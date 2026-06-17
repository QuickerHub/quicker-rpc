import "server-only";

import { generateId, type UIMessageStreamWriter } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

type SdkStreamEvent = {
  type: string;
  message?: { content?: Array<{ type: string; text?: string }> };
  call_id?: string;
  name?: string;
  args?: unknown;
  status?: string;
  result?: unknown;
  text?: string;
};

function assistantTextFromEvent(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

async function* readNdjsonStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          yield JSON.parse(line) as SdkStreamEvent & {
            type: "__result__" | "__error__" | string;
            error?: string;
            result?: string;
            status?: string;
          };
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail) {
      yield JSON.parse(tail) as SdkStreamEvent & {
        type: "__result__" | "__error__" | string;
        error?: string;
        result?: string;
        status?: string;
      };
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamCursorSdkEventsToWriter(
  writer: UIMessageStreamWriter<AgentUIMessage>,
  events: AsyncIterable<SdkStreamEvent & { type: string; error?: string; result?: string }>,
  params: {
    modelId: string;
  },
): Promise<{ status: string; resultText?: string }> {
  writer.write({
    type: "start",
    messageMetadata: { model: params.modelId },
  });
  writer.write({ type: "start-step" });

  let pendingAssistant = "";
  const toolStarted = new Set<string>();
  let finalStatus = "error";
  let finalResult: string | undefined;

  for await (const event of events) {
    if (event.type === "__result__") {
      finalStatus = typeof event.status === "string" ? event.status : "error";
      finalResult = typeof event.result === "string" ? event.result : undefined;
      continue;
    }
    if (event.type === "__error__") {
      writer.write({
        type: "error",
        errorText: event.error ?? "Cursor SDK run failed",
      });
      continue;
    }

    // Thinking / interim assistant text are not shown — they stream as token
    // fragments and duplicate the final answer. Keep only tools + final result.
    if (event.type === "thinking" && typeof event.text === "string") {
      continue;
    }

    if (event.type === "assistant" && event.message?.content) {
      pendingAssistant = assistantTextFromEvent(event.message.content);
      continue;
    }

    if (event.type === "tool_call" && event.call_id) {
      const callId = event.call_id;
      const toolName =
        event.name === "mcp" ? "qkrpc_mcp" : (event.name ?? "tool");

      if (!toolStarted.has(callId)) {
        toolStarted.add(callId);
        writer.write({
          type: "tool-input-start",
          toolCallId: callId,
          toolName,
        });
        if (event.args !== undefined) {
          writer.write({
            type: "tool-input-available",
            toolCallId: callId,
            toolName,
            input: event.args,
          });
        }
      }

      if (event.status === "completed") {
        writer.write({
          type: "tool-output-available",
          toolCallId: callId,
          output: event.result ?? null,
        });
      } else if (event.status === "error") {
        writer.write({
          type: "tool-output-error",
          toolCallId: callId,
          errorText:
            typeof event.result === "string"
              ? event.result
              : "Cursor SDK tool call failed",
        });
      }
      continue;
    }

    if (event.type === "status" && event.status === "ERROR") {
      writer.write({
        type: "error",
        errorText:
          typeof (event as { message?: string }).message === "string"
            ? (event as { message?: string }).message
            : "Cursor SDK run failed",
      });
    }
  }

  const answer = (finalResult ?? pendingAssistant).trim();
  if (answer) {
    const textId = generateId();
    writer.write({ type: "text-start", id: textId });
    writer.write({ type: "text-delta", id: textId, delta: answer });
    writer.write({ type: "text-end", id: textId });
  }

  writer.write({ type: "finish-step" });
  writer.write({
    type: "finish",
    finishReason: finalStatus === "finished" ? "stop" : "error",
    messageMetadata: { model: params.modelId },
  });

  return {
    status: finalStatus,
    resultText: finalResult,
  };
}

export async function streamCursorSdkNdjsonResponseToWriter(
  writer: UIMessageStreamWriter<AgentUIMessage>,
  params: {
    response: Response;
    modelId: string;
  },
): Promise<{ status: string; resultText?: string }> {
  if (!params.response.ok || !params.response.body) {
    let message = `cursor-sdk-runtime chat failed (${params.response.status})`;
    try {
      const body = (await params.response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return streamCursorSdkEventsToWriter(
    writer,
    readNdjsonStream(params.response.body),
    { modelId: params.modelId },
  );
}
