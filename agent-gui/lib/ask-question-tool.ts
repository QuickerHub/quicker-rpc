import { tool } from "ai";
import { z } from "zod";
import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { formatLocalToolResult } from "@/lib/tool-result";

export const ASK_QUESTION_TOOL = "ask_question" as const;

const askQuestionOptionSchema = z.object({
  id: z.string().min(1).describe("Stable option id returned in answers"),
  label: z
    .string()
    .min(1)
    .describe("User-visible option label (same language as prompt)"),
});

const askQuestionItemSchema = z.object({
  id: z.string().min(1).describe("Stable question id returned in answers"),
  prompt: z.string().min(1).describe("Question text shown to the user"),
  allow_multiple: z
    .boolean()
    .optional()
    .describe("When true, user may pick more than one option"),
  options: z
    .array(askQuestionOptionSchema)
    .min(2)
    .describe("At least two choices; prefer 2–5 concise options"),
});

export const askQuestionInputSchema = z.object({
  title: z
    .string()
    .optional()
    .describe("Optional heading above the question block"),
  questions: z
    .array(askQuestionItemSchema)
    .min(1)
    .max(8)
    .describe("One or more questions; batch when the user must decide several things"),
});

export type AskQuestionOption = z.infer<typeof askQuestionOptionSchema>;
export type AskQuestionItem = z.infer<typeof askQuestionItemSchema>;
export type AskQuestionInput = z.infer<typeof askQuestionInputSchema>;

export type AskQuestionAnswer = {
  optionIds: string[];
  labels: string[];
};

export type AskQuestionOutputData = {
  action: typeof ASK_QUESTION_TOOL;
  answers: Record<string, AskQuestionAnswer>;
};

/** Client-side tool: no execute — UI collects answers via addToolOutput. */
export const ASK_QUESTION_TOOL_DEF = tool({
  description:
    "Present multiple-choice questions in chat and wait for the user's selection. "
    + "Use when you need a concrete preference (which page, mode, scope, yes/no branch) and free-text would be ambiguous. "
    + "Provide 2–5 clear options per question; use the same language as the user. "
    + "Do not use for destructive confirmations (those use the built-in delete approval UI). "
    + "After output, continue with the chosen option ids.",
  inputSchema: askQuestionInputSchema,
});

export function isAskQuestionTool(toolName: string): boolean {
  return toolName === ASK_QUESTION_TOOL;
}

export function isAskQuestionAwaitingInput(
  toolName: string,
  state: string,
): boolean {
  return isAskQuestionTool(toolName) && state === "input-available";
}

export function parseAskQuestionInput(input: unknown): AskQuestionInput | null {
  const parsed = askQuestionInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function buildAskQuestionToolOutput(
  answers: Record<string, AskQuestionAnswer>,
): ReturnType<typeof formatLocalToolResult> {
  return formatLocalToolResult({
    action: ASK_QUESTION_TOOL,
    answers,
  } satisfies AskQuestionOutputData);
}

export function parseAskQuestionOutputData(
  output: unknown,
): AskQuestionOutputData | null {
  if (typeof output !== "object" || output === null) return null;
  const root = output as Record<string, unknown>;
  const data =
    typeof root.data === "object" && root.data !== null
      ? (root.data as Record<string, unknown>)
      : root;
  if (data.action !== ASK_QUESTION_TOOL) return null;
  if (typeof data.answers !== "object" || data.answers === null) return null;
  return data as AskQuestionOutputData;
}

export function summarizeAskQuestionOutput(output: unknown): string | null {
  const data = parseAskQuestionOutputData(output);
  if (!data) return null;
  const parts: string[] = [];
  for (const answer of Object.values(data.answers)) {
    if (answer.labels.length === 0) continue;
    parts.push(answer.labels.join("、"));
  }
  if (parts.length === 0) return "已选择";
  return parts.join("；");
}

export function askQuestionDisplayTitle(input: unknown): string {
  const parsed = parseAskQuestionInput(input);
  if (!parsed) return "请选择";
  if (parsed.title?.trim()) return parsed.title.trim();
  if (parsed.questions.length === 1) {
    return parsed.questions[0]!.prompt.trim();
  }
  return "请选择";
}

export type PendingAskQuestion = {
  toolCallId: string;
  input: AskQuestionInput;
};

export function emptyAskQuestionSelections(
  questions: AskQuestionItem[],
): Record<string, string[]> {
  return Object.fromEntries(questions.map((q) => [q.id, []]));
}

export function buildAskQuestionAnswersFromSelections(
  questions: AskQuestionItem[],
  selections: Record<string, string[]>,
): Record<string, AskQuestionAnswer> {
  const answers: Record<string, AskQuestionAnswer> = {};
  for (const question of questions) {
    const optionIds = selections[question.id] ?? [];
    const labels = optionIds.map((id) => {
      const option = question.options.find((o) => o.id === id);
      return option?.label ?? id;
    });
    answers[question.id] = { optionIds, labels };
  }
  return answers;
}

export function collectPendingAskQuestions(
  messages: UIMessage[],
): PendingAskQuestion[] {
  const pending: PendingAskQuestion[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      if (getToolOrDynamicToolName(part) !== ASK_QUESTION_TOOL) continue;
      if (!("state" in part) || part.state !== "input-available") continue;
      if (!("toolCallId" in part) || typeof part.toolCallId !== "string") {
        continue;
      }

      const parsed = parseAskQuestionInput(
        "input" in part ? part.input : undefined,
      );
      if (!parsed) continue;

      pending.push({
        toolCallId: part.toolCallId,
        input: parsed,
      });
    }
  }

  return pending;
}

export function countPendingAskQuestions(messages: UIMessage[]): number {
  return collectPendingAskQuestions(messages).length;
}
