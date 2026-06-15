import { parseJsonEventStream } from "@ai-sdk/provider-utils";
import { readUIMessageStream, uiMessageChunkSchema } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

export type ParsedAgentGuiChatStream = {
  ok: boolean;
  messages: AgentUIMessage[];
  error?: string;
};

function userMessageFromParts(
  id: string,
  text: string,
): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: text.trim() }],
  };
}

function textToReadableStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function bodyToReadableStream(
  body: ReadableStream<Uint8Array> | Uint8Array | string,
): ReadableStream<Uint8Array> {
  if (typeof body === "string") {
    return textToReadableStream(body);
  }
  if (body instanceof Uint8Array) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    });
  }
  return body;
}

export async function parseAgentGuiChatStream(
  body: ReadableStream<Uint8Array> | Uint8Array | string,
  seedUserMessage?: AgentUIMessage,
): Promise<ParsedAgentGuiChatStream> {
  const messages: AgentUIMessage[] = seedUserMessage ? [seedUserMessage] : [];
  let lastAssistant: AgentUIMessage | undefined;

  const chunkStream = parseJsonEventStream({
    stream: bodyToReadableStream(body),
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) {
          controller.error(chunk.error);
          return;
        }
        controller.enqueue(chunk.value);
      },
    }),
  );

  try {
    for await (const uiMessage of readUIMessageStream({
      stream: chunkStream,
      onError: (error) => {
        throw error;
      },
    })) {
      if (uiMessage.role === "assistant") {
        lastAssistant = uiMessage as AgentUIMessage;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      messages,
      error: `stream parse failed: ${message}`,
    };
  }

  if (lastAssistant) {
    messages.push(lastAssistant);
  }

  return {
    ok: Boolean(lastAssistant),
    messages,
    error: lastAssistant ? undefined : "no assistant message in stream",
  };
}

export async function parseAgentGuiChatResponse(
  response: Response,
  seedUserText?: string,
): Promise<ParsedAgentGuiChatStream> {
  const chatId =
    typeof response.url === "string"
      ? `agent-eval-ui-${Date.now()}`
      : `agent-eval-ui-${Date.now()}`;
  const seed = seedUserText
    ? userMessageFromParts(`${chatId}-user`, seedUserText)
    : undefined;

  if (!response.ok) {
    const text = await response.text();
    let error = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) error = parsed.error;
    } catch {
      // keep raw text
    }
    return {
      ok: false,
      messages: seed ? [seed] : [],
      error,
    };
  }

  if (!response.body) {
    return {
      ok: false,
      messages: seed ? [seed] : [],
      error: "empty response body",
    };
  }

  return parseAgentGuiChatStream(response.body, seed);
}

/** Parse completed /api/chat body (e.g. Playwright Response.text() / .body()). */
export async function parseAgentGuiChatResponseBody(
  options: {
    ok: boolean;
    body?: string | Uint8Array | null;
    status?: number;
    seedUserText?: string;
  },
): Promise<ParsedAgentGuiChatStream> {
  const chatId = `agent-eval-ui-${Date.now()}`;
  const seed = options.seedUserText
    ? userMessageFromParts(`${chatId}-user`, options.seedUserText)
    : undefined;

  if (!options.ok) {
    const text =
      typeof options.body === "string"
        ? options.body
        : options.body
          ? new TextDecoder().decode(options.body)
          : "";
    let error = text || `HTTP ${options.status ?? "error"}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) error = parsed.error;
    } catch {
      // keep raw text
    }
    return {
      ok: false,
      messages: seed ? [seed] : [],
      error,
    };
  }

  if (!options.body) {
    return {
      ok: false,
      messages: seed ? [seed] : [],
      error: "empty response body",
    };
  }

  return parseAgentGuiChatStream(options.body, seed);
}
