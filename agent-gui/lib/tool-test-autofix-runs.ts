export type AutoFixRunStatus = "idle" | "running" | "done" | "error";

export type AutoFixRunResult = {
  source: "chat";
  modelId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
  };
  error?: string;
};

export type AutoFixRunEntry = {
  id: string;
  at: number;
  scenarioId: string;
  scenarioLabel: string;
  requestPayload: string;
  llmSelection: string;
  llmModelLabel: string;
  status: AutoFixRunStatus;
  chatMessages: import("@/lib/chat-types").AgentUIMessage[];
  result?: AutoFixRunResult;
};

export function createAutoFixRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `autofix-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatAutoFixRunTime(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

