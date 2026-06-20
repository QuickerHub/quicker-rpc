import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SessionAnalysisResult } from "@/lib/agent-session-analysis";
import {
  AUTHORING_ESSENTIAL_SECTIONS,
  extractMarkdownSections,
} from "@/lib/agent-skills/preload-essentials";
import {
  PATTERN_SKILL_RULES,
  rankPatternSkills,
} from "@/lib/agent-skills/skill-intent-preload";
import { buildAgentTurnState } from "@/lib/agent-turn-state";

export type ApplyHintsOptions = {
  userPrompt: string;
  dryRun?: boolean;
};

export type ApplyHintsResult = {
  applied: string[];
  skipped: string[];
};

const SKILL_INTENT_FILE = "agent-gui/lib/agent-skills/skill-intent-preload.ts";
const PRELOAD_ESSENTIALS_FILE = "agent-gui/lib/agent-skills/preload-essentials.ts";
const TIER0_PATH = "docs/skills/quicker-authoring/prompt-tier0.md";

function repoRootFromCwd(): string {
  const cwd = process.cwd();
  return cwd.endsWith("agent-gui") || cwd.endsWith("agent-gui\\")
    ? join(cwd, "..")
    : cwd;
}

/** Deterministic, repo-local tweaks from session-analysis findings. */
export async function applySessionOptimizationHints(
  analysis: SessionAnalysisResult,
  options: ApplyHintsOptions,
): Promise<ApplyHintsResult> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const ruleIds = new Set(analysis.trace.findings.map((f) => f.ruleId));

  if (ruleIds.has("docs-call-heavy")) {
    const result = await maybeExtendSkillIntentPreload(options.userPrompt, options.dryRun);
    if (result) applied.push(result);
    else skipped.push("docs-call-heavy: keywords already covered or no match");
  }

  if (
    ruleIds.has("create-then-read-data")
    || ruleIds.has("redundant-read-empty-data")
  ) {
    const result = await maybeAddCreateFlowEssential(options.dryRun);
    if (result) applied.push(result);
    else skipped.push("create-flow: Workspace essentials already present");
  }

  if (ruleIds.has("write-without-step-runner-get")) {
    skipped.push(
      "write-without-step-runner-get: covered by preloaded tier0 Hard rules — monitor next run",
    );
  }

  if (ruleIds.has("C-duplicate-search")) {
    skipped.push("C-duplicate-search: requires Plugin StepRunnerCatalogMapper change");
  }

  if (ruleIds.has("schema-validation-error")) {
    skipped.push(
      "schema-validation-error: qkrpc_action_create schema already documents object info — check model compliance",
    );
  }

  return { applied, skipped };
}

async function maybeExtendSkillIntentPreload(
  userPrompt: string,
  dryRun?: boolean,
): Promise<string | null> {
  const turnState = buildAgentTurnState({
    actionScope: { pinnedLatestAll: [] },
    chatMode: "agent",
    enabledToolIds: [],
    userText: userPrompt,
  });
  const ranked = rankPatternSkills({
    userText: userPrompt,
    intent: turnState.intent,
    slashCommandName: null,
    actionPinned: false,
  });
  if (ranked.length > 0) {
    return null;
  }

  const tokens = extractKeywordCandidates(userPrompt);
  if (tokens.length === 0) return null;

  const filePath = join(repoRootFromCwd(), SKILL_INTENT_FILE);
  const raw = await readFile(filePath, "utf8");

  const missing = tokens.filter(
    (token) => !raw.toLowerCase().includes(`"${token.toLowerCase()}"`),
  );
  if (missing.length === 0) return null;

  const skillGuess = guessPatternSkillForPrompt(userPrompt);
  if (!skillGuess) return null;

  const existingRule = PATTERN_SKILL_RULES.find((r) => r.skill === skillGuess);
  if (!existingRule) return null;

  const newKeywords = missing.slice(0, 3);
  if (dryRun) {
    return `docs-call-heavy: would add keywords [${newKeywords.join(", ")}] to ${skillGuess}`;
  }

  const rulePattern = new RegExp(
    `(skill:\\s*"${skillGuess.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?keywords:\\s*\\[)([\\s\\S]*?)(\\])`,
  );
  const match = raw.match(rulePattern);
  if (!match) return null;

  const keywordBlock = match[2]!.trimEnd();
  const additions = newKeywords.map((kw) => ` "${kw}",`).join("\n");
  const updated = raw.replace(
    rulePattern,
    `${match[1]}${keywordBlock}${keywordBlock.endsWith(",") ? "" : ","}\n${additions}\n  ${match[3]}`,
  );
  await writeFile(filePath, updated, "utf8");
  return `docs-call-heavy: added keywords [${newKeywords.join(", ")}] → ${skillGuess}`;
}

async function maybeAddCreateFlowEssential(dryRun?: boolean): Promise<string | null> {
  if ((AUTHORING_ESSENTIAL_SECTIONS as readonly string[]).includes("Workspace")) {
    return null;
  }

  const essentialsPath = join(repoRootFromCwd(), PRELOAD_ESSENTIALS_FILE);
  const tier0Path = join(repoRootFromCwd(), TIER0_PATH);

  const tier0 = await readFile(tier0Path, "utf8");
  const workspaceSection = extractMarkdownSections(tier0, ["Workspace"]);
  if (!workspaceSection.includes("After create") && !workspaceSection.includes("NO re-get")) {
    return null;
  }

  let essentialsRaw = await readFile(essentialsPath, "utf8");
  if (essentialsRaw.includes('"Workspace"')) {
    return null;
  }

  if (dryRun) {
    return "create-flow: would add Workspace to AUTHORING_ESSENTIAL_SECTIONS";
  }

  essentialsRaw = essentialsRaw.replace(
    /export const AUTHORING_ESSENTIAL_SECTIONS = \[\n([\s\S]*?)\] as const;/,
    (block, inner) => {
      if (inner.includes('"Workspace"')) return block;
      return `export const AUTHORING_ESSENTIAL_SECTIONS = [\n${inner}  "Workspace",\n] as const;`;
    },
  );
  await writeFile(essentialsPath, essentialsRaw, "utf8");
  return "create-flow: added Workspace to AUTHORING_ESSENTIAL_SECTIONS preload";
}

function extractKeywordCandidates(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[\s，。、；;:：()（）\[\]{}<>《》"'`]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 12);
  return [...new Set(words)].slice(0, 5);
}

function guessPatternSkillForPrompt(prompt: string): string | null {
  const text = prompt.toLowerCase();
  if (/多变量|同时设置|表达式步骤|批量赋值|\{var\}=|a=1.*b=2/.test(text)) {
    return "quicker-authoring-evalexpression-multi-var";
  }
  if (/http|json|api|get|请求|接口/.test(text)) {
    return "quicker-authoring-http-json-api";
  }
  if (/剪贴板|clipboard|clip/.test(text)) {
    return "quicker-authoring-clipboard-pipeline";
  }
  if (/assign|赋值|变量/.test(text)) {
    return "quicker-authoring-evalexpression-multi-var";
  }
  if (/条件|url/.test(text)) {
    return "quicker-authoring-conditional-http";
  }
  return "quicker-authoring-http-json-api";
}
