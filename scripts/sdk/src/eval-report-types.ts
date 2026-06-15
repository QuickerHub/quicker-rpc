/** Shared eval report types (mirror agent-gui/lib/agent-eval/types.ts). */

export type AgentEvalToolCall = {
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
};

export type AgentEvalMockVerify = {
  ok: boolean;
  actionId?: string;
  profileId: string;
  exitCode?: number;
  assertionsPassed?: boolean;
};

export type AgentEvalTraceRubric = {
  passed: boolean;
  violations: string[];
};

export type AgentEvalJudgeAxis = "A" | "B" | "C" | "D" | "E" | "F";

export type AgentEvalJudgeScores = Partial<
  Record<AgentEvalJudgeAxis, 0 | 1 | 2>
>;

export type AgentEvalJudgeResult = {
  scores: AgentEvalJudgeScores;
  percent?: number;
  notes?: string;
  passed?: boolean;
};

export type AgentEvalReport = {
  runner: "agent-gui" | "cursor-sdk";
  taskId: string;
  tier?: string;
  status: "finished" | "error" | "startup_error";
  durationMs: number;
  assistantText: string;
  toolCalls: AgentEvalToolCall[];
  traceRubric?: AgentEvalTraceRubric;
  mockVerify?: AgentEvalMockVerify;
  judge?: AgentEvalJudgeResult;
  error?: string;
  outPath?: string;
  requestId?: string;
};
