import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_ASK, CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import type { AgentTurnIntent } from "@/lib/agent-turn-state";
import { buildAgentTurnState, isStepDiscoveryPrompt } from "@/lib/agent-turn-state";
import { loadSkillInstructions } from "@/lib/agent-skills/load";
import { extractMarkdownSections } from "@/lib/agent-skills/preload-essentials";

/** Sections pulled from pattern SKILL.md bodies for turn preload (keep small). */
export const PATTERN_SKILL_BRIEF_SECTIONS = [
  "何时加载",
  "步骤骨架",
  "硬规则（本场景）",
] as const;

export const MAX_INTENT_MATCHED_SKILLS = 2;
export const MAX_SKILL_BRIEF_CHARS = 640;

type PatternSkillRule = {
  skill: string;
  keywords: readonly string[];
};

/** Keyword → pattern skill routing (on-demand skills only). */
export const PATTERN_SKILL_RULES: readonly PatternSkillRule[] = [
  {
    skill: "quicker-authoring-getquicker-user-actions",
    keywords: [
      "getquicker",
      "user/actions",
      "获赞",
      "totallikes",
      "actioncount",
      "分享页",
      "公开动作",
    ],
  },
  {
    skill: "quicker-authoring-http-json-api",
    keywords: [
      "http",
      "api",
      "json",
      "rest",
      "fetch",
      "请求",
      "接口",
      "jsonextract",
      "getquicker",
      "抓取",
      "分页",
      "获赞",
      "html",
      "爬虫",
    ],
  },
  {
    skill: "quicker-authoring-clipboard-pipeline",
    keywords: [
      "clipboard",
      "剪贴板",
      "cliptext",
      "复制",
      "粘贴",
      "去重",
      "空行",
      "排序",
      "行数",
      "写回",
      "getclipboard",
    ],
  },
  {
    skill: "quicker-authoring-selection-pipeline",
    keywords: ["selection", "选中文本", "选中", "selected text"],
  },
  {
    skill: "quicker-authoring-subprogram-extract",
    keywords: ["subprogram", "子程序", "var:", "callidentifier"],
  },
  {
    skill: "quicker-authoring-conditional-http",
    keywords: ["条件", "url 空", "empty url", "conditional http", "guard url"],
  },
  {
    skill: "quicker-authoring-loop-control",
    keywords: ["each", "repeat", "循环", "simpleif", "分支", "ifsteps"],
  },
  {
    skill: "quicker-authoring-csv-parse-aggregate",
    keywords: ["csv", "表格", "聚合", "sum", "求和"],
  },
  {
    skill: "quicker-authoring-form-param-input",
    keywords: ["form", "表单", "sys:form", "formdef"],
  },
  {
    skill: "quicker-authoring-evalexpression-multi-var",
    keywords: [
      "多变量",
      "multi var",
      "linq",
      "批量赋值",
      "{var}=",
      "表达式步骤",
      "evalexpression",
      "同时设置",
      "a=1",
      "a+b",
    ],
  },
  {
    skill: "quicker-authoring-expression-first",
    keywords: ["去重", "排序", "拼接", "distinct", "sort", "transform"],
  },
  {
    skill: "quicker-authoring-regex-extract-pipeline",
    keywords: ["regex", "正则", "regexextract", "match1"],
  },
  {
    skill: "quicker-authoring-path-and-exists",
    keywords: ["pathexists", "路径", "存在", "isexists", "checkpath"],
  },
  {
    skill: "quicker-action-library-search",
    keywords: ["getquicker", "动作库", "library", "分享", "shared action"],
  },
  {
    skill: "quicker-authoring-run-action-delegate",
    keywords: ["runaction", "委托", "delegate", "调用动作"],
  },
  {
    skill: "quicker-authoring-delay-retry",
    keywords: ["retry", "重试", "轮询", "poll", "delay"],
  },
] as const;

/** Suggested OR query for step_runner_search when a pattern skill is preloaded. */
export const PATTERN_SKILL_OR_QUERIES: Readonly<Record<string, string>> = {
  "quicker-authoring-clipboard-pipeline":
    "getClipboardText|writeClipboard|evalexpression|notify",
  "quicker-authoring-evalexpression-multi-var":
    "evalexpression|showText|assign",
  "quicker-authoring-getquicker-user-actions":
    "http|regexExtract|repeat|evalexpression|assign",
  "quicker-authoring-http-json-api":
    "http|jsonextract|evalexpression",
  "quicker-authoring-selection-pipeline":
    "getselectedtext|writeClipboard|evalexpression",
  "quicker-authoring-loop-control":
    "each|repeat|simpleIf",
  "quicker-authoring-regex-extract-pipeline":
    "regexExtract|evalexpression",
  "quicker-authoring-delay-retry":
    "repeat|delay|simpleIf",
};

/** Only these skills hard-limit step_runner_search to one OR query per turn. */
export const STRICT_SINGLE_STEP_RUNNER_SEARCH_SKILLS = new Set([
  "quicker-authoring-clipboard-pipeline",
]);

export type ScoredPatternSkill = {
  skill: string;
  score: number;
};

export function shouldStrictSingleStepRunnerSearch(
  matchedSkills: readonly string[],
): boolean {
  return matchedSkills.some((skill) =>
    STRICT_SINGLE_STEP_RUNNER_SEARCH_SKILLS.has(skill),
  );
}

export function shouldBlockDocsForPreloadedSkills(
  scored: readonly ScoredPatternSkill[],
): boolean {
  if (scored.length === 0) {
    return false;
  }
  const top = scored[0];
  if (STRICT_SINGLE_STEP_RUNNER_SEARCH_SKILLS.has(top.skill)) {
    return true;
  }
  if (
    top.skill === "quicker-authoring-evalexpression-multi-var"
    && top.score >= 2
  ) {
    return true;
  }
  return false;
}

export function suggestStepRunnerOrQuery(matchedSkills: readonly string[]): string | undefined {
  for (const skill of matchedSkills) {
    const query = PATTERN_SKILL_OR_QUERIES[skill];
    if (query) {
      return query;
    }
  }
  return undefined;
}

export type RankPatternSkillsParams = {
  userText: string;
  intent: AgentTurnIntent;
  slashCommandName?: string | null;
  actionPinned?: boolean;
};

function normalizeMatchText(text: string): string {
  return text.toLowerCase();
}

function scoreRule(text: string, rule: PatternSkillRule): number {
  let score = 0;
  for (const keyword of rule.keywords) {
    if (text.includes(keyword.toLowerCase())) score += 1;
  }
  if (
    rule.skill === "quicker-authoring-clipboard-pipeline"
    && text.includes("剪贴板")
    && (text.includes("去重") || text.includes("排序") || text.includes("空行"))
  ) {
    score += 2;
  }
  if (
    rule.skill === "quicker-authoring-evalexpression-multi-var"
    && (text.includes("表达式") || text.includes("evalexpression"))
    && (text.includes("同时") || text.includes("多变量") || text.includes("a="))
  ) {
    score += 2;
  }
  if (
    rule.skill === "quicker-authoring-evalexpression-multi-var"
    && (text.includes("不要弹窗") || text.includes("不要") && text.includes("文本窗口"))
  ) {
    score -= 5;
  }
  if (
    rule.skill === "quicker-authoring-getquicker-user-actions"
    && text.includes("getquicker")
    && (text.includes("获赞") || text.includes("totallikes") || text.includes("actioncount"))
  ) {
    score += 6;
  }
  if (
    rule.skill === "quicker-authoring-http-json-api"
    && (
      text.includes("getquicker")
      || text.includes("抓取")
      || text.includes("分页")
      || text.includes("获赞")
    )
  ) {
    score += 3;
  }
  return score;
}

/** Rank pattern skills with scores for the current turn. */
export function rankPatternSkillsScored(
  params: RankPatternSkillsParams,
): ScoredPatternSkill[] {
  const text = normalizeMatchText(params.userText);
  const authoringContext =
    params.intent === "action_authoring"
    || params.slashCommandName === "author"
    || params.actionPinned === true
    || isStepDiscoveryPrompt(params.userText);

  if (!authoringContext || !text.trim()) {
    return [];
  }

  const minScore =
    params.slashCommandName === "author"
    || isStepDiscoveryPrompt(params.userText)
    || params.intent === "action_authoring"
      ? 1
      : 2;
  return PATTERN_SKILL_RULES.map((rule) => ({
    skill: rule.skill,
    score: scoreRule(text, rule),
  }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill));
}

/** Rank pattern skills for the current turn; returns up to MAX_INTENT_MATCHED_SKILLS names. */
export function rankPatternSkills(params: RankPatternSkillsParams): string[] {
  const scored = rankPatternSkillsScored(params);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of scored) {
    if (seen.has(entry.skill)) continue;
    seen.add(entry.skill);
    out.push(entry.skill);
    if (out.length >= MAX_INTENT_MATCHED_SKILLS) break;
  }
  return out;
}

/** Extract a compact excerpt from a pattern skill body. */
export function extractSkillBriefForPreload(
  body: string,
  maxChars = MAX_SKILL_BRIEF_CHARS,
): string {
  const sections = extractMarkdownSections(body, PATTERN_SKILL_BRIEF_SECTIONS);
  const trimmed = (sections || body.replace(/^#\s+.+\n+/m, "").trim()).trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}\n\n_(truncated — docs get or Read skill for full body)_`;
}

export type FormatIntentMatchedSkillsParams = {
  userText: string;
  chatMode: ChatMode;
  cwd?: string;
  slashCommandName?: string | null;
  actionScope?: ActionScopeHint;
};

/** Build optional system block with intent-matched pattern skill briefs. */
export async function formatIntentMatchedSkillsForPrompt(
  params: FormatIntentMatchedSkillsParams,
): Promise<string> {
  if (params.chatMode === CHAT_MODE_LAUNCHER || params.chatMode === CHAT_MODE_ASK) {
    return "";
  }

  const actionScope = params.actionScope ?? { pinnedLatestAll: [] };
  const turnState = buildAgentTurnState({
    actionScope,
    chatMode: params.chatMode,
    enabledToolIds: [],
    userText: params.userText,
  });

  const skillNames = rankPatternSkills({
    userText: params.userText,
    intent: turnState.intent,
    slashCommandName: params.slashCommandName,
    actionPinned: actionScope.pinnedLatestAll.length > 0,
  });

  if (skillNames.length === 0) return "";

  const blocks: string[] = [
    "## Intent-matched skills (this turn)",
    "Brief excerpts preloaded from user intent.",
    "Do NOT call docs for step module keys or evalexpression/$= syntax when this block covers the workflow — use qkrpc_step_runner_search → get; quicker-eval-expression is session-preloaded.",
    "",
  ];

  for (const skillName of skillNames) {
    const loaded = await loadSkillInstructions(skillName, params.cwd);
    if (!loaded?.body) continue;
    const brief = extractSkillBriefForPreload(loaded.body);
    if (!brief) continue;
    blocks.push(`### ${skillName}`, brief, "");
  }

  return blocks.length <= 3 ? "" : blocks.join("\n").trimEnd();
}
