import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTHORING_ESSENTIAL_SECTIONS,
  EVAL_EXPRESSION_ESSENTIAL_SECTIONS,
  extractMarkdownSections,
} from "./preload-essentials.ts";
import {
  formatPreloadedSkillsCatalogForPrompt,
  formatPreloadedSkillsEssentialsForPrompt,
  isPreloadedSkillBodyInPromptEnabled,
} from "./prompt-catalog.ts";

const SAMPLE_TIER0 = `# header

## Pattern traps (do not guess)

- trap one

## P0–P7

\`\`\`text
P0  connect
\`\`\`

## Hard rules

- NO guess inputParams

## Workspace

skip this
`;

const SAMPLE_TIER2 = `## Pick (P4)

| need | step |
| one var | **sys:assign** |

## Two surfaces (read before writing)

| surface | syntax |

## Expression eval template (do not paste verbatim into actions)

skip template
`;

test("extractMarkdownSections pulls named ## blocks only", () => {
  const out = extractMarkdownSections(SAMPLE_TIER0, AUTHORING_ESSENTIAL_SECTIONS);
  assert.ok(out.includes("Pattern traps"));
  assert.ok(out.includes("Hard rules"));
  assert.ok(out.includes("P0  connect"));
  assert.ok(out.includes("Workspace"));
});

test("extractMarkdownSections pulls P4 pick from eval tier", () => {
  const out = extractMarkdownSections(
    SAMPLE_TIER2,
    EVAL_EXPRESSION_ESSENTIAL_SECTIONS,
  );
  assert.ok(out.includes("sys:assign"));
  assert.ok(out.includes("Two surfaces"));
  assert.ok(!out.includes("Expression eval template"));
});

test("isPreloadedSkillBodyInPromptEnabled defaults to essentials mode", () => {
  const prev = process.env.HARNESS_PRELOAD_SKILLS;
  delete process.env.HARNESS_PRELOAD_SKILLS;
  assert.equal(isPreloadedSkillBodyInPromptEnabled(), false);
  process.env.HARNESS_PRELOAD_SKILLS = "1";
  assert.equal(isPreloadedSkillBodyInPromptEnabled(), true);
  if (prev === undefined) delete process.env.HARNESS_PRELOAD_SKILLS;
  else process.env.HARNESS_PRELOAD_SKILLS = prev;
});

test("formatPreloadedSkillsCatalogForPrompt lists preloaded skill names", async () => {
  const block = await formatPreloadedSkillsCatalogForPrompt();
  assert.ok(block.includes("quicker-authoring"));
  assert.ok(block.includes("catalog"));
  assert.ok(!block.includes("## Skill:"));
});

test("formatPreloadedSkillsEssentialsForPrompt includes hard rules and P4 pick", async () => {
  const block = await formatPreloadedSkillsEssentialsForPrompt();
  assert.ok(block.includes("essentials"));
  assert.ok(block.includes("Pattern traps"));
  assert.ok(block.includes("NO guess inputParams"));
  assert.ok(block.includes("NO re-get"));
  assert.ok(block.includes("sys:assign"));
  assert.ok(!block.includes("Expression eval template"));
});
