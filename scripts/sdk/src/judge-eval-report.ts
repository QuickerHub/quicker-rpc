import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Agent, CursorAgentError } from "@cursor/sdk";
import { loadTask } from "./benchmark-catalog.js";
import { requireApiKey, workspaceRoot } from "./config.js";
import type {
  AgentEvalJudgeResult,
  AgentEvalReport,
} from "./eval-report-types.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
const AUTHORING_PATH = join(
  srcDir,
  "..",
  "..",
  "..",
  "agent-gui",
  "benchmarks",
  "authoring-tasks.json",
);

type AuthoringTaskMeta = {
  userPrompt: string;
  axes?: string[];
  rubric?: {
    must?: string[];
    should?: string[];
    mustNot?: string[];
  };
};

function loadAuthoringMeta(taskId: string): AuthoringTaskMeta | null {
  try {
    loadTask(taskId);
    const catalog = JSON.parse(readFileSync(AUTHORING_PATH, "utf8")) as {
      tasks: AuthoringTaskMeta & { id: string }[];
    };
    const task = catalog.tasks.find((t) => t.id === taskId);
    return task ?? null;
  } catch {
    return null;
  }
}

function parseJudgeJson(text: string): AgentEvalJudgeResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      scores?: Record<string, number>;
      notes?: string;
    };
    const scores: AgentEvalJudgeResult["scores"] = {};
    for (const axis of ["A", "B", "C", "D", "E", "F"] as const) {
      const raw = parsed.scores?.[axis];
      if (raw === 0 || raw === 1 || raw === 2) {
        scores[axis] = raw;
      }
    }
    return {
      scores,
      notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
    };
  } catch {
    return null;
  }
}

function scorePercent(
  scores: AgentEvalJudgeResult["scores"],
  axes: readonly string[],
): number {
  const weights: Record<string, number> = {
    A: 0.2,
    B: 0.2,
    C: 0.15,
    D: 0.15,
    E: 0.15,
    F: 0.15,
  };
  let weightSum = 0;
  let earned = 0;
  for (const axis of axes) {
    const w = weights[axis] ?? 0.15;
    const raw = scores[axis as keyof typeof scores];
    const normalized = raw === undefined ? 0 : raw / 2;
    weightSum += w;
    earned += w * normalized;
  }
  if (weightSum <= 0) return 0;
  return Math.round((earned / weightSum) * 100);
}

export async function judgeEvalReport(
  report: AgentEvalReport,
  options: { minPercent?: number } = {},
): Promise<AgentEvalJudgeResult> {
  requireApiKey();
  const meta = loadAuthoringMeta(report.taskId);
  const minPercent = options.minPercent ?? 70;
  const axes = meta?.axes?.length ? meta.axes : ["C", "E"];

  const prompt = `You are a strict benchmark judge for QuickerAgent runs.
Score only from the evidence below. Output a single JSON object (no markdown fence):
{
  "scores": { "A": 0|1|2, "B": 0|1|2, ... only axes that apply },
  "notes": "one short paragraph"
}
Axes: A=planning, B=tooling choice, C=search→get, D=implementation, E=workflow rules, F=runnable.
0=fail, 1=partial, 2=pass.

Score only these axes: ${axes.join(", ")}

User task:
${meta?.userPrompt ?? report.taskId}

Rubric:
${JSON.stringify(meta?.rubric ?? { note: "gui scenario — infer C/E from trace and reply" }, null, 2)}

Assistant reply:
${report.assistantText.slice(0, 6000)}

Tool trace JSON:
${JSON.stringify(report.toolCalls, null, 2)}

Trace rubric violations:
${JSON.stringify(report.traceRubric?.violations ?? [])}

Mock verify:
${JSON.stringify(report.mockVerify ?? null)}
`;

  await using agent = await Agent.create({
    apiKey: requireApiKey(),
    model: { id: process.env.CURSOR_SDK_MODEL?.trim() || "composer-2.5" },
    local: {
      cwd: workspaceRoot(),
      autoReview: false,
    },
  });

  try {
    const run = await agent.send(prompt);
    const result = await run.wait();
    if (result.status !== "finished") {
      return {
        scores: {},
        notes: `judge run status=${result.status}`,
        passed: false,
      };
    }
    const parsed = parseJudgeJson(result.result ?? "");
    if (!parsed) {
      return {
        scores: {},
        notes: "judge returned unparseable JSON",
        passed: false,
      };
    }
    const percent = scorePercent(parsed.scores, axes);
    return {
      ...parsed,
      percent,
      passed: percent >= minPercent,
    };
  } catch (err) {
    const message =
      err instanceof CursorAgentError ? err.message : String(err);
    return {
      scores: {},
      notes: `judge error: ${message}`,
      passed: false,
    };
  }
}

export function loadEvalReportFromFile(path: string): AgentEvalReport {
  return JSON.parse(readFileSync(path, "utf8")) as AgentEvalReport;
}

export function saveEvalReport(path: string, report: AgentEvalReport): void {
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const reportPath = process.argv[2];
  if (!reportPath) {
    throw new Error("Usage: npm run judge -- <report.json> [--json] [--write]");
  }
  const json = process.argv.includes("--json");
  const write = process.argv.includes("--write");

  const report = loadEvalReportFromFile(reportPath);
  const judge = await judgeEvalReport(report);

  if (write) {
    const target = report.outPath ?? reportPath;
    report.judge = judge;
    saveEvalReport(target, report);
  }

  if (json) {
    console.log(JSON.stringify(judge, null, 2));
  } else {
    console.error(`judge percent=${judge.percent ?? "—"} passed=${judge.passed}`);
    if (judge.notes) console.error(judge.notes);
  }

  if (judge.passed === false) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
