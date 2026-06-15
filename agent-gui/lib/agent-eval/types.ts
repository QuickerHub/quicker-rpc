/** Unified report schema for agent-gui-eval and cursor-sdk benchmark runners. */

export type AgentEvalRunner = "agent-gui" | "agent-gui-ui" | "cursor-sdk";

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

export type AgentEvalRuntimeMetadata = {
  feedbackCount: number;
  recoveryDecision: Record<string, unknown>;
  turnState: Record<string, unknown> | null;
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

export type AgentEvalCapabilityAxis =
  | "tool_protocol"
  | "runtime_intent"
  | "runtime_risk"
  | "recovery"
  | "verification";

export type AgentEvalCapabilityStatus =
  | "pass"
  | "fail"
  | "unknown";

export type AgentEvalCapabilityItem = {
  axis: AgentEvalCapabilityAxis;
  status: AgentEvalCapabilityStatus;
  notes: string[];
};

export type AgentEvalCapabilitySummary = {
  passed: boolean;
  items: AgentEvalCapabilityItem[];
};

export type AgentEvalCapabilityAxisStats = {
  axis: AgentEvalCapabilityAxis;
  pass: number;
  fail: number;
  unknown: number;
};

export type AgentEvalCapabilityAggregate = {
  total: number;
  axes: AgentEvalCapabilityAxisStats[];
};

export type AgentEvalReport = {
  runner: AgentEvalRunner;
  taskId: string;
  tier?: string;
  status: "finished" | "error" | "startup_error";
  durationMs: number;
  assistantText: string;
  toolCalls: AgentEvalToolCall[];
  runtimeMetadata?: AgentEvalRuntimeMetadata[];
  traceRubric?: AgentEvalTraceRubric;
  capabilitySummary?: AgentEvalCapabilitySummary;
  mockVerify?: AgentEvalMockVerify;
  judge?: AgentEvalJudgeResult;
  error?: string;
  outPath?: string;
  requestId?: string;
};
