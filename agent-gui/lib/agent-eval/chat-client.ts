import type { AgentUIMessage } from "@/lib/chat-types";
import {
  parseAgentGuiChatResponse,
  parseAgentGuiChatStream,
} from "@/lib/agent-eval/chat-stream";

export { parseAgentGuiChatResponse, parseAgentGuiChatStream };

export type AgentGuiChatRequest = {
  baseUrl: string;
  userText: string;
  workingDirectory: string;
  llmSelection?: string;
  chatMode?: "agent" | "launcher";
  chatId?: string;
  signal?: AbortSignal;
};

export type AgentGuiChatResult = {
  ok: boolean;
  messages: AgentUIMessage[];
  error?: string;
  httpStatus?: number;
};

function resolveAgentGuiBaseUrl(): string {
  const explicit = process.env.AGENT_GUI_EVAL_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const port = process.env.AGENT_GUI_PORT?.trim() || "3000";
  const host = process.env.AGENT_GUI_HOST?.trim() || "127.0.0.1";
  return `http://${host}:${port}`;
}

export function defaultAgentGuiBaseUrl(): string {
  return resolveAgentGuiBaseUrl();
}

export async function postAgentGuiChat(
  request: AgentGuiChatRequest,
): Promise<AgentGuiChatResult> {
  const chatId = request.chatId ?? `agent-eval-${Date.now()}`;
  const userMessage: AgentUIMessage = {
    id: `${chatId}-user`,
    role: "user",
    parts: [{ type: "text", text: request.userText.trim() }],
  };

  const body = {
    id: chatId,
    trigger: "submit-message",
    messages: [userMessage],
    workingDirectory: request.workingDirectory,
    chatMode: request.chatMode ?? "agent",
    llmSelection: request.llmSelection?.trim() || undefined,
  };

  let response: Response;
  try {
    response = await fetch(`${request.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      messages: [userMessage],
      error: `fetch failed: ${message}`,
    };
  }

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
      messages: [userMessage],
      error,
      httpStatus: response.status,
    };
  }

  if (!response.body) {
    return {
      ok: false,
      messages: [userMessage],
      error: "empty response body",
      httpStatus: response.status,
    };
  }

  const parsed = await parseAgentGuiChatStream(response.body, userMessage);
  return {
    ok: parsed.ok,
    messages: parsed.messages.length > 0 ? parsed.messages : [userMessage],
    error: parsed.error,
    httpStatus: response.status,
  };
}
