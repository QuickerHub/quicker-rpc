import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentSkill } from "@/lib/agent-skills/discover";
import {
  AUTHORING_ESSENTIAL_SECTIONS,
  EVAL_EXPRESSION_ESSENTIAL_SECTIONS,
  extractMarkdownSections,
} from "@/lib/agent-skills/preload-essentials";
import {
  PRELOADED_SKILL_NAMES,
  PRELOADED_SKILL_SCOPES,
  SKILL_TIER2_BODY_FILES,
  resolveSkillsRoot,
} from "@/lib/agent-skills/paths";

/** When true, inject full tier-2 skill bodies at session start. Default: essentials excerpt. */
export function isPreloadedSkillBodyInPromptEnabled(): boolean {
  const raw = process.env.HARNESS_PRELOAD_SKILLS?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return false;
}

/** Short catalog for preloaded skills — full body via docs search/get or Read skill dir. */
export async function formatPreloadedSkillsCatalogForPrompt(
  cwd?: string,
): Promise<string> {
  const lines = [
    "## Preloaded skills (catalog)",
    "Full instructions on demand: docs search/get, Read `.cursor/skills/<name>/SKILL.md`, or list_tools action=bundles for tool packs.",
    "",
  ];
  let any = false;
  for (const name of PRELOADED_SKILL_NAMES) {
    const record = await getAgentSkill(name, cwd);
    const scope =
      PRELOADED_SKILL_SCOPES[name]
      ?? record?.description?.trim()
      ?? "see skill directory";
    const desc = record?.description?.trim();
    lines.push(
      `- **${name}**: ${scope}${desc && desc !== scope ? ` — ${desc}` : ""}`,
    );
    any = true;
  }
  return any ? lines.join("\n") : "";
}

type EssentialsCache = { mtimeMs: number; content: string };

let essentialsCache: EssentialsCache | null = null;

async function tierFileMtimeMs(skillDir: string, skillName: string): Promise<number> {
  const tierFile = SKILL_TIER2_BODY_FILES[skillName];
  if (!tierFile) return 0;
  try {
    return (await stat(join(skillDir, tierFile))).mtimeMs;
  } catch {
    return 0;
  }
}

async function readTierMarkdown(skillName: string): Promise<string> {
  const skillDir = join(resolveSkillsRoot(), skillName);
  const tierFile = SKILL_TIER2_BODY_FILES[skillName];
  if (!tierFile) return "";
  return readFile(join(skillDir, tierFile), "utf8");
}

/** Default preload: hard rules + P4 pick from tier-2 files (~60 lines). Full body via docs or HARNESS_PRELOAD_SKILLS=1. */
export async function formatPreloadedSkillsEssentialsForPrompt(
  _cwd?: string,
): Promise<string> {
  const root = resolveSkillsRoot();
  let mtimeMs = 0;
  for (const name of PRELOADED_SKILL_NAMES) {
    mtimeMs = Math.max(mtimeMs, await tierFileMtimeMs(join(root, name), name));
  }
  if (essentialsCache && essentialsCache.mtimeMs === mtimeMs) {
    return essentialsCache.content;
  }

  const authoringBody = await readTierMarkdown("quicker-authoring");
  const evalBody = await readTierMarkdown("quicker-eval-expression");
  const authoringEssentials = extractMarkdownSections(
    authoringBody,
    AUTHORING_ESSENTIAL_SECTIONS,
  );
  const evalEssentials = extractMarkdownSections(
    evalBody,
    EVAL_EXPRESSION_ESSENTIAL_SECTIONS,
  );

  const lines = [
    "## Preloaded skills (essentials)",
    "Hard rules below; full skill via docs search/get or Read skill dir. Set HARNESS_PRELOAD_SKILLS=1 for full tier-2 body.",
    "",
    "### quicker-authoring",
    PRELOADED_SKILL_SCOPES["quicker-authoring"] ?? "",
    "",
    authoringEssentials,
    "",
    "### quicker-eval-expression",
    PRELOADED_SKILL_SCOPES["quicker-eval-expression"] ?? "",
    "",
    evalEssentials,
  ];

  const content = lines.join("\n").trimEnd();
  essentialsCache = { mtimeMs, content };
  return content;
}
