/**
 * Empty-chat / benchmark prompts — sourced from authoring benchmark tasks.
 * @see docs/agent-authoring-benchmark.md
 * @see agent-gui/benchmarks/authoring-tasks.json
 */
import {
  AUTHORING_BENCHMARK_CATEGORY_LABELS,
  AUTHORING_BENCHMARK_CATEGORY_ORDER,
  AUTHORING_BENCHMARK_TASKS,
  type AuthoringBenchmarkCategory,
  type AuthoringBenchmarkTask,
} from "@/lib/authoring-benchmark";

/** @deprecated Use AuthoringBenchmarkCategory */
export type EmptyChatPromptCategory = AuthoringBenchmarkCategory;

export type EmptyChatPrompt = {
  id: string;
  category: EmptyChatPromptCategory;
  /** Short label on the chip */
  label: string;
  /** One-line summary shown on the card */
  hint: string;
  /** Full text sent to the agent (natural language) */
  text: string;
  /** Expect no create/patch/delete (search, get, docs only). */
  readOnly?: boolean;
  /** Benchmark tier L0–L4 */
  tier?: string;
};

export const EMPTY_CHAT_PROMPT_CATEGORY_LABELS = AUTHORING_BENCHMARK_CATEGORY_LABELS;

/** @deprecated Use AUTHORING_BENCHMARK_CATEGORY_ORDER */
export const EMPTY_CHAT_PROMPT_CATEGORY_ORDER = AUTHORING_BENCHMARK_CATEGORY_ORDER;

function toEmptyChatPrompt(task: AuthoringBenchmarkTask): EmptyChatPrompt {
  return {
    id: task.id,
    category: task.category,
    label: task.label,
    hint: task.hint,
    text: task.userPrompt,
    readOnly: task.readOnly,
    tier: task.tier,
  };
}

/**
 * Agent benchmark prompts (natural-language user messages).
 * Paste `text` into a new chat thread for manual evaluation.
 */
export const EMPTY_CHAT_ACTION_PROMPTS: readonly EmptyChatPrompt[] =
  AUTHORING_BENCHMARK_TASKS.map(toEmptyChatPrompt);

export function groupEmptyChatPromptsByCategory(
  prompts: readonly EmptyChatPrompt[] = EMPTY_CHAT_ACTION_PROMPTS,
): { category: EmptyChatPromptCategory; label: string; items: EmptyChatPrompt[] }[] {
  const byCat = new Map<EmptyChatPromptCategory, EmptyChatPrompt[]>();
  for (const p of prompts) {
    const list = byCat.get(p.category) ?? [];
    list.push(p);
    byCat.set(p.category, list);
  }
  return EMPTY_CHAT_PROMPT_CATEGORY_ORDER.filter((c) => byCat.has(c)).map(
    (category) => ({
      category,
      label: EMPTY_CHAT_PROMPT_CATEGORY_LABELS[category],
      items: byCat.get(category)!,
    }),
  );
}
