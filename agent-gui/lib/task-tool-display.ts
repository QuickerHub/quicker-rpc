import { isStructuredToolResult } from "@/lib/tool-result";

export type TaskToolInput = {
  agent?: string;
  prompt?: string;
};

export type TaskToolStepSummary = {
  toolCalls: string[];
  textPreview: string;
};

export type TaskToolResultData = {
  agent: string;
  prompt: string;
  result: string;
  steps: number;
  toolSummary: TaskToolStepSummary[];
};

export function parseTaskToolInput(input: unknown): TaskToolInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  return {
    agent: typeof obj.agent === "string" ? obj.agent : undefined,
    prompt: typeof obj.prompt === "string" ? obj.prompt : undefined,
  };
}

export function parseTaskToolResult(output: unknown): TaskToolResultData | null {
  if (!isStructuredToolResult(output)) return null;
  const d = output.data;
  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    return null;
  }
  const data = d as Record<string, unknown>;
  if (typeof data.agent !== "string" || typeof data.result !== "string") {
    return null;
  }
  return {
    agent: data.agent,
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    result: data.result,
    steps: typeof data.steps === "number" ? data.steps : 0,
    toolSummary: Array.isArray(data.toolSummary)
      ? (data.toolSummary as TaskToolStepSummary[])
      : [],
  };
}

export function taskToolDisplayTitle(input: unknown): string {
  const parsed = parseTaskToolInput(input);
  const agent = parsed?.agent?.trim();
  return agent ? `子代理 · ${agent}` : "子代理";
}

export function summarizeTaskToolOutput(output: unknown): string | null {
  const result = parseTaskToolResult(output);
  if (!result) return null;
  const preview = result.result.trim().replace(/\s+/g, " ");
  if (!preview) return `完成（${result.steps} 步）`;
  return preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
}
