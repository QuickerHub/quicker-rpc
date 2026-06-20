import {
  AUTHORING_BENCHMARK_TASKS,
  type AuthoringBenchmarkTask,
} from "@/lib/authoring-benchmark";

function normalizePrompt(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。；：、！？,.;:!?]/g, " ")
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(normalizePrompt(a).split(" ").filter((t) => t.length >= 2));
  const tokensB = new Set(normalizePrompt(b).split(" ").filter((t) => t.length >= 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.min(tokensA.size, tokensB.size);
}

/** Best-effort match export user prompt to an authoring benchmark task. */
export function matchAuthoringBenchmarkTask(
  userPrompt: string,
): AuthoringBenchmarkTask | undefined {
  const normalizedUser = normalizePrompt(userPrompt);
  if (!normalizedUser) return undefined;

  // Exact normalized match first
  for (const task of AUTHORING_BENCHMARK_TASKS) {
    if (normalizePrompt(task.userPrompt) === normalizedUser) {
      return task;
    }
  }

  let best: AuthoringBenchmarkTask | undefined;
  let bestScore = 0;

  for (const task of AUTHORING_BENCHMARK_TASKS) {
    const taskPrompt = task.userPrompt;
    const normalizedTask = normalizePrompt(taskPrompt);

    if (
      normalizedUser.includes(normalizedTask)
      || normalizedTask.includes(normalizedUser)
    ) {
      // Prefer longer (more specific) task when one prompt contains another
      if (!best || normalizedTask.length > normalizePrompt(best.userPrompt).length) {
        best = task;
        bestScore = 1;
      }
      continue;
    }

    const score = tokenOverlapScore(userPrompt, taskPrompt);
    if (score > bestScore && score >= 0.45) {
      bestScore = score;
      best = task;
    }
  }

  return best;
}
