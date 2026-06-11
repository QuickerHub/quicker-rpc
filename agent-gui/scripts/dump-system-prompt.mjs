#!/usr/bin/env node
/** One-off: dump assembled QuickerAgent system prompt (agent mode, no cwd extras). */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL_ROOT = join(ROOT, "docs/skills/quicker-authoring");

const LAYER_ORDER = [
  "router",
  "workflow",
  "schema",
  "catalog",
  "adjunct",
  "cli-only",
  "other",
];
const LAYER_LABELS = {
  router: "Router",
  workflow: "Workflow",
  schema: "Schema",
  catalog: "Modules",
  adjunct: "Adjunct",
  "cli-only": "CLI",
  other: "Other",
};

function extractPromptConst(tsSource, constName) {
  const re = new RegExp(
    `export const ${constName} = prompt\\(([\\s\\S]*?)\\);`,
  );
  const m = tsSource.match(re);
  if (!m) return "";
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"'))
    .map((l) =>
      l
        .replace(/^"/, "")
        .replace(/",?$/, "")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n"),
    )
    .join("\n");
}

async function buildTopicIndex(manifest) {
  const topics = manifest.topics.map((t) => ({
    ...t,
    layer: t.layer || t.metadata?.layer || "other",
    refs: manifest.referenceCatalog?.[t.topic] ?? [],
  }));

  const byLayer = new Map();
  for (const t of topics) {
    if (!byLayer.has(t.layer)) byLayer.set(t.layer, []);
    byLayer.get(t.layer).push(t);
  }

  const lines = ["### Topic index (workflows → docs get; references/ → search)"];
  for (const layer of LAYER_ORDER) {
    const list = byLayer.get(layer);
    if (!list?.length) continue;
    lines.push("", `#### ${LAYER_LABELS[layer] ?? layer}`);
    for (const t of list.sort((a, b) => a.topic.localeCompare(b.topic))) {
      lines.push(`- ${t.topic}: ${(t.description ?? "").trim() || t.title}`);
    }
  }
  return lines.join("\n");
}

async function buildOnDemandCatalog() {
  const skillsRoot = join(ROOT, "docs/skills");
  const names = (await readdir(skillsRoot)).filter(
    (n) => n !== "quicker-authoring",
  );
  const lines = [
    "## Available skills (on demand)",
    "Match task to description; load full instructions via docs get when needed.",
    "",
    "<available_skills>",
  ];
  for (const name of names.sort()) {
    try {
      const md = await readFile(join(skillsRoot, name, "SKILL.md"), "utf8");
      const desc =
        md.match(/description:\s*"([^"]+)"/)?.[1]
        ?? md.match(/description:\s*'([^']+)'/)?.[1]
        ?? "";
      lines.push(
        "<skill>",
        `<name>${name}</name>`,
        `<description>${desc}</description>`,
        "</skill>",
      );
    } catch {
      // skip
    }
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

function extractJoinedStringConst(tsSource, constName) {
  const m = tsSource.match(
    new RegExp(`export const ${constName} = \`([\\s\\S]*?)\`;`),
  );
  if (m) return m[1];
  const arr = tsSource.match(
    new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\]\\.join`),
  );
  if (!arr) return "";
  return arr[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"') || l.startsWith("'"))
    .map((l) => {
      const q = l[0];
      return l
        .slice(1)
        .replace(new RegExp(`${q},?$`), "")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"');
    })
    .join("\n");
}

async function buildToolRoutingPrompt() {
  const toolRoutingTs = await readFile(
    join(ROOT, "agent-gui/lib/tool-routing.ts"),
    "utf8",
  );
  const rowsMatch = toolRoutingTs.match(
    /const TOOL_ROUTING_ROWS = \[([\s\S]*?)\] as const;/,
  );
  const toolRoutingTable = rowsMatch
    ? rowsMatch[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith('"'))
        .map((l) => l.replace(/^"/, "").replace(/",?$/, "").replace(/\\"/g, '"'))
        .join("\n")
    : "";
  return [
    "## Tool routing",
    "Pick exactly one tool from the table; params live in that tool's schema.",
    toolRoutingTable,
  ].join("\n");
}

async function buildSearchStrategyPrompt() {
  const src = await readFile(
    join(ROOT, "agent-gui/lib/search-strategy-prompt.ts"),
    "utf8",
  );
  const rowsMatch = src.match(
    /const SEARCH_STRATEGY_ROWS = \[([\s\S]*?)\] as const;/,
  );
  const rows = rowsMatch
    ? rowsMatch[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith('"'))
        .map((l) => l.replace(/^"/, "").replace(/",?$/, "").replace(/\\"/g, '"'))
        .join("\n")
    : "";
  return [
    "## Search-first",
    "Uncertain id/key/syntax/API → search, then act. Weak or empty hits → re-query with | synonyms (中文|english), wildcards, or broader terms; search again before guessing.",
    "Authoring: docs search finds topics and references/ deep docs (not listed in prompt). Quicker data: query tools, not web_search.",
    rows,
  ].join("\n");
}

async function buildBaseSystemInstructions() {
  const workbenchTs = await readFile(
    join(ROOT, "agent-gui/lib/workbench-agent-prompt.ts"),
    "utf8",
  );
  const searchStrategy = await buildSearchStrategyPrompt();
  const toolRouting = await buildToolRoutingPrompt();
  const workbench = extractJoinedStringConst(
    workbenchTs,
    "WORKBENCH_AGENT_PROMPT",
  );
  const system = [
    "## Role",
    "QuickerAgent: general assistant for Quicker desktop + user's local environment.",
    "Match user intent first — run/debug actions, settings, web_search, shell, browser, LLM config, or (when asked) author programs. Tool params in tool descriptions.",
    "",
    "## Communication",
    "- Reply in the user's language (default Chinese). Never expose tool names, CLI, or JSON shapes in user-facing text.",
    "- Describe outcomes plainly; execute tools silently. Surface only real decisions (which action, page, scope).",
    "- Be concise; summarize tool JSON briefly. Action query tables render in UI — never paste markdown tables.",
    "- After disk edits: one line pointing user to the right workbench (**已改动** / Diff) — do not paste full diffs unless asked.",
    "",
    "## Runtime",
    "- qkrpc via serve (HTTP → plugin), not per-call subprocesses. Sidebar cwd = workspace root for shell, qkrpc, workspace_program.",
    "- Disposable workspace files (test data, patch JSON, downloads, one-off scripts) → `.local/` under cwd (gitignored). NOT workspace root or tracked source trees.",
    "- Header shows RPC status; no connectivity probe tool.",
    "- shell_exec auto-prepends qkrpc and rg (ripgrep) to PATH (see lib/qkrpc-toolchain-env.mjs). On connectivity_failure: call qkrpc_wait once, then retry or ask user — no shell ping/probe/serve loops.",
    "- On connectivity_failure / qkrpc unavailable: tell user (Quicker + QuickerRpc plugin + serve). STOP — no shell_exec ping/probe/serve/build.ps1/qkrpc CLI workaround unless user explicitly asks to fix the environment.",
    '- Action refs: `<qka id="uuid">Title</qka>` inline mention (UI chip); `<qka-link id="uuid" use="run,edit,..."/>` operation bar. NO identical retry on transient_error/timeout.',
    "",
    searchStrategy,
    "",
    toolRouting,
    "",
    workbench,
    "",
    "## Capabilities",
    "**Run**: qkrpc_action_run; **debug**: qkrpc_action_debug. **Sync**: qkrpc_action_get (skip after create). **Edit body**: workspace_program → patch.",
    "**Create**: qkrpc_action_create → workspace_program. **Layout**: qkrpc_profile_* / qkrpc_action_move.",
    "**Settings**: quicker_settings list/get/set/apply; action=open preset for UI panels.",
    "**Local disk**: workspace_file (plain files, `.local/` scratch); workspace_program (`.quicker` program bodies); shell_exec (build/test/git, rg search); user reviews in workbench 已改动.",
    "**Web**: web_search for discovery; browser for page work — read: navigate → content(selector/offset) or evaluate; act: navigate → snapshot → ref ops, re-snapshot after navigated/openedTab. **LLM**: llm_settings.",
    "**Safety**: delete only on user ask (UI Confirm); ask_question for 2–5 preferences not deletes.",
    "**Dev UI**: dev_frontend_check after agent-gui edits until ok=true (agent-gui/AGENTS.md).",
    "",
    "## Skills",
    "Preloaded tier-2 instructions below (agentskills.io). On-demand skills listed in catalog; docs get/search/index for references.",
  ].join("\n");
  return { system, toolRouting, workbench };
}

async function main() {
  const manifest = JSON.parse(
    await readFile(join(SKILL_ROOT, "topics.json"), "utf8"),
  );
  const tier0Raw = await readFile(join(SKILL_ROOT, "prompt-tier0.md"), "utf8");
  const tier0 = tier0Raw.trim();
  const actionLinkTs = await readFile(
    join(ROOT, "agent-gui/lib/action-link-markup.ts"),
    "utf8",
  );

  const { system: baseSystem, toolRouting, workbench } =
    await buildBaseSystemInstructions();

  const scope =
    "create/edit program bodies (steps, variables, files). Else use main Capabilities.";
  const topicIndex = await buildTopicIndex(manifest);
  const skillBlock = [
    "## Skill: quicker authoring",
    `Scope: ${scope}`,
    "",
    tier0,
    "",
    'Workflows → docs get (full). references/ → docs search (snippet). No session-start multi-get.',
    "",
    topicIndex,
  ].join("\n");

  const postPatch = extractJoinedStringConst(
    actionLinkTs,
    "ACTION_LINK_SUMMARY_PROMPT",
  );
  const catalog = await buildOnDemandCatalog();

  const full = [
    baseSystem,
    "",
    skillBlock,
    "",
    "### Post-patch summary",
    postPatch,
    "",
    catalog,
  ]
    .filter((s) => s.trim().length > 0)
    .join("\n\n");

  const outDir = join(ROOT, ".local");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "agent-system-prompt-sample.txt");
  await writeFile(outPath, full, "utf8");

  const breakdown = {
    totalChars: full.length,
    estTokensDiv4: Math.round(full.length / 4),
    baseSystemChars: baseSystem.length,
    toolRoutingChars: toolRouting.length,
    workbenchChars: workbench.length,
    skillBlockChars: skillBlock.length,
    tier0Chars: tier0.length,
    topicIndexChars: topicIndex.length,
    postPatchChars: postPatch.length,
    onDemandCatalogChars: catalog.length,
  };

  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(breakdown, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
