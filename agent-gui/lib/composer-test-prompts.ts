import quickerbenchData from "@/benchmarks/quickerbench-tasks.json";
import {
  QUICKERBENCH_CORE_TASK_IDS,
  type QuickerBenchCatalog,
  type QuickerBenchTask,
} from "@/lib/quickerbench/catalog-types";
import type {
  TitleTestExample,
  TitleTestExampleGroup,
} from "@/lib/tool-test-title-examples";

const QUICKERBENCH_TIER_LABELS: Record<string, string> = {
  Q1: "Q1 · 单能力",
  Q2: "Q2 · 多步编排",
  Q3: "Q3 · 外部集成",
};

const QUICKERBENCH_TIER_ORDER = ["Q3", "Q2", "Q1"] as const;

function formatIoDescription(task: QuickerBenchTask): string {
  const inputs = task.ioContract.inputs.map((field) => field.key).join(", ");
  const outputs = task.ioContract.outputs.map((field) => field.key).join(", ");
  return `入 ${inputs} → 出 ${outputs}`;
}

function loadCoreQuickerBenchTasks(): QuickerBenchTask[] {
  const catalog = quickerbenchData as QuickerBenchCatalog;
  const order = new Map(QUICKERBENCH_CORE_TASK_IDS.map((id, index) => [id, index]));
  return catalog.tasks
    .filter((task) => order.has(task.id as (typeof QUICKERBENCH_CORE_TASK_IDS)[number]))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function taskToExample(task: QuickerBenchTask): TitleTestExample {
  return {
    id: task.id,
    label: task.label,
    description: formatIoDescription(task),
    userText: task.userPrompt,
  };
}

/** Main-chat composer: QuickerBench core tasks (IO subprogram-style). */
export function buildComposerTestPromptGroups(): TitleTestExampleGroup[] {
  const tasks = loadCoreQuickerBenchTasks();
  return QUICKERBENCH_TIER_ORDER.map((tier) => ({
    id: `quickerbench-${tier.toLowerCase()}`,
    label: QUICKERBENCH_TIER_LABELS[tier] ?? tier,
    examples: tasks.filter((task) => task.tier === tier).map(taskToExample),
  })).filter((group) => group.examples.length > 0);
}

export const COMPOSER_TEST_PROMPT_GROUPS: readonly TitleTestExampleGroup[] =
  buildComposerTestPromptGroups();

export const COMPOSER_TEST_PROMPTS: readonly TitleTestExample[] =
  COMPOSER_TEST_PROMPT_GROUPS.flatMap((group) => group.examples);
