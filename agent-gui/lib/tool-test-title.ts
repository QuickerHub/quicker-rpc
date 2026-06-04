import type { AgentUIMessage } from "@/lib/chat-types";
import {
  buildTitleRequestPayload,
  deriveProvisionalThreadTitle,
} from "@/lib/thread-title";

/** Payload sent to /api/chat on first turn (may include simulated assistant context). */
export function buildTitleTestUserPayload(
  userText: string,
  assistantText?: string,
): string {
  const user = userText.trim();
  const assistant = assistantText?.trim();
  if (!assistant) return user;
  return `${user}\n\n（以下助手回复仅作标题参考，模拟同线程后续上下文）\n${assistant}`;
}

export function buildTitleTestMessages(
  userText: string,
  assistantText?: string,
): AgentUIMessage[] {
  const user = userText.trim();
  if (!user) return [];

  const messages: AgentUIMessage[] = [
    {
      id: "tool-test-user",
      role: "user",
      parts: [{ type: "text", text: user }],
    },
  ];

  const assistant = assistantText?.trim();
  if (assistant) {
    messages.push({
      id: "tool-test-assistant",
      role: "assistant",
      parts: [{ type: "text", text: assistant }],
    });
  }

  return messages;
}

export type TitleTestTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TitleTestApiResult = {
  title: string;
  source?: string;
  modelId?: string;
  usage?: TitleTestTokenUsage;
  /** Local title if chat skipped the model (production path only). */
  localReference?: string;
  warning?: string;
  error?: string;
};

export async function callTitleTestApi(params: {
  messages: AgentUIMessage[];
  llmSelection?: string;
}): Promise<TitleTestApiResult> {
  const { provisional, context } = buildTitleRequestPayload(params.messages);
  const res = await fetch("/api/chat/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context,
      provisional,
      llmSelection: params.llmSelection,
      testMode: true,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err =
      typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
    return { title: provisional, error: err };
  }

  const title =
    typeof data.title === "string" ? data.title : provisional;

  let usage: TitleTestTokenUsage | undefined;
  const rawUsage = data.usage;
  if (rawUsage && typeof rawUsage === "object") {
    const u = rawUsage as Record<string, unknown>;
    const inputTokens = typeof u.inputTokens === "number" ? u.inputTokens : 0;
    const outputTokens = typeof u.outputTokens === "number" ? u.outputTokens : 0;
    const totalTokens =
      typeof u.totalTokens === "number"
        ? u.totalTokens
        : inputTokens + outputTokens;
    usage = { inputTokens, outputTokens, totalTokens };
  }

  return {
    title,
    source: typeof data.source === "string" ? data.source : undefined,
    modelId: typeof data.modelId === "string" ? data.modelId : undefined,
    usage,
    localReference: provisional,
    warning: typeof data.warning === "string" ? data.warning : undefined,
  };
}

/** What production would use without calling the model (reference only). */
export function localReferenceTitle(messages: AgentUIMessage[]): string {
  return deriveProvisionalThreadTitle(messages);
}
