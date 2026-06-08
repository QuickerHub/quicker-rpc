import type { AskQuestionOutputData } from "@/lib/ask-question-tool";

export type AskQuestionRunEntry = {
  id: string;
  at: number;
  scenarioId: string;
  scenarioLabel: string;
  status: "done";
  durationMs: number;
  outputSummary: string;
  answers?: AskQuestionOutputData["answers"];
};

export function createAskQuestionRunId(): string {
  return `ask-q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatAskQuestionRunTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
