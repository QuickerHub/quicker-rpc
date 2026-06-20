import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractSkillBriefForPreload,
  rankPatternSkills,
  rankPatternSkillsScored,
  shouldBlockDocsForPreloadedSkills,
} from "./skill-intent-preload.ts";

const HTTP_SKILL_BODY = `# HTTP skill

## 何时加载

When REST JSON API.

## 步骤骨架

1. sys:http
2. sys:jsonExtract

## 深度阅读

long docs here that should not appear in brief
`;

test("rankPatternSkills matches HTTP JSON authoring intent", () => {
  const skills = rankPatternSkills({
    userText: "创建一个调用 REST API 并解析 JSON 字段的动作",
    intent: "action_authoring",
  });
  assert.ok(skills.includes("quicker-authoring-http-json-api"));
});

test("rankPatternSkills matches clipboard + transform discover prompt", () => {
  const skills = rankPatternSkills({
    userText:
      "剪贴板文本按行去重并排序，应该用哪种步骤？不要猜参数键名",
    intent: "conversation",
  });
  assert.ok(skills.includes("quicker-authoring-clipboard-pipeline"));
});

test("rankPatternSkills prioritizes evalexpression-multi-var for multi-var-assign", () => {
  const skills = rankPatternSkills({
    userText:
      "新建动作：用一个表达式步骤同时设置 a=1、b=2、c=a+b，最后用文本窗口显示 c 的值。",
    intent: "action_authoring",
  });
  assert.equal(skills[0], "quicker-authoring-evalexpression-multi-var");
});

test("rankPatternSkills prioritizes clipboard for clip-lines authoring", () => {
  const skills = rankPatternSkills({
    userText:
      "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。",
    intent: "action_authoring",
  });
  assert.equal(skills[0], "quicker-authoring-clipboard-pipeline");
  assert.ok(skills.includes("quicker-authoring-expression-first"));
});

test("rankPatternSkills returns empty outside authoring context", () => {
  const skills = rankPatternSkills({
    userText: "调用 REST API",
    intent: "conversation",
  });
  assert.deepEqual(skills, []);
});

test("rankPatternSkills lowers threshold for slash author command", () => {
  const skills = rankPatternSkills({
    userText: "剪贴板 CSV 求和",
    intent: "conversation",
    slashCommandName: "author",
  });
  assert.ok(
    skills.includes("quicker-authoring-clipboard-pipeline")
    || skills.includes("quicker-authoring-csv-parse-aggregate"),
  );
});

test("extractSkillBriefForPreload keeps skeleton sections only", () => {
  const brief = extractSkillBriefForPreload(HTTP_SKILL_BODY, 500);
  assert.ok(brief.includes("sys:http"));
  assert.ok(brief.includes("何时加载"));
  assert.ok(!brief.includes("深度阅读"));
});

test("rankPatternSkills prioritizes getquicker skill for scrape prompt", () => {
  const userText =
    "做一个 Quicker 动作，不要弹窗或文本窗口。运行时用 `{quicker_in_param}` 接收 getquicker 用户分享页链接。"
    + "抓取该用户全部公开动作（含分页），把获赞总数写入输出变量 `totalLikes`，动作个数写入 `actionCount`。";
  const skills = rankPatternSkills({
    userText,
    intent: "action_authoring",
  });
  assert.equal(skills[0], "quicker-authoring-getquicker-user-actions");
});

test("shouldBlockDocsForPreloadedSkills skips getquicker scrape prompt", () => {
  const userText =
    "做一个 Quicker 动作，不要弹窗或文本窗口。运行时用 `{quicker_in_param}` 接收 getquicker 用户分享页链接。"
    + "抓取该用户全部公开动作（含分页），把获赞总数写入输出变量 `totalLikes`，动作个数写入 `actionCount`。";
  const scored = rankPatternSkillsScored({
    userText,
    intent: "action_authoring",
  });
  assert.equal(shouldBlockDocsForPreloadedSkills(scored), false);
});

test("formatIntentMatchedSkillsForPrompt loads HTTP skill excerpt", async () => {
  const { formatIntentMatchedSkillsForPrompt } = await import(
    "./skill-intent-preload.ts"
  );
  const block = await formatIntentMatchedSkillsForPrompt({
    userText: "编写 REST API JSON 字段提取动作",
    chatMode: "agent",
  });
  assert.ok(block.includes("Intent-matched skills"));
  assert.ok(block.includes("quicker-authoring-http-json-api"));
  assert.ok(block.includes("sys:http"));
});
