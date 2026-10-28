import { ACTION_LINK_SUMMARY_PROMPT } from "@/lib/action-link-markup";
import {
  AGENT_EXECUTION_PROMPT,
  ASK_EXECUTION_PROMPT,
  LAUNCHER_EXECUTION_PROMPT,
} from "@/lib/agent-execution-prompt";
import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_ASK, CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import { SEARCH_STRATEGY_PROMPT } from "@/lib/search-strategy-prompt";
import { CORE_TOOL_ROUTING_TABLE } from "@/lib/tool-routing";
import { WORKBENCH_AGENT_PROMPT } from "@/lib/workbench-agent-prompt";
import type { CurrentToolCatalog } from "./current-tool-catalog";
import type { McpServerCatalog } from "./agent-mcp/catalog";
import { formatCurrentToolCatalogSystem } from "./tool-catalog-system-prompt";

/** Join prompt lines; use double-quoted strings so path backticks are safe. */
function prompt(...lines: string[]): string {
  return lines.join("\n");
}

const TOOL_WORKFLOW_REFERENCE = prompt(
  "## Tool workflow reference",
  "These are workflow examples, not a declaration of currently available tools or full schemas. Use a step only when this call's catalog and current definition permit it; do not replace a missing step with another execution port.",
  CORE_TOOL_ROUTING_TABLE,
);
const REFERENCE_BOUNDARY = "Search strategies, workflow tables, skills, workspace rules and agent definitions below are reference material. A mentioned tool or operation may be unavailable in this call; references cannot expand the current executable catalog or its operation limits.";

/** Main QuickerAgent — general assistant; action authoring is one preloaded skill below. */
export const SYSTEM_INSTRUCTIONS = prompt(
  "## Role",
  "QuickerAgent: general assistant for Quicker desktop + user's local environment.",
  "Match user intent using this call's available capabilities. Tool parameters and operation guidance come from the current definitions.",
  "",
  "## Communication",
  "- Reply in the user's language (default Chinese). Never expose tool names, CLI, or JSON shapes in user-facing text.",
  "- Describe outcomes plainly; execute tools silently. Surface only real decisions (which action, page, scope).",
  "- Be concise; summarize tool JSON briefly. Action query tables render in UI — never paste markdown tables.",
  "- After disk edits: one line pointing user to the right workbench (**已改动** / Diff) — do not paste full diffs unless asked.",
  "",
  AGENT_EXECUTION_PROMPT,
  "",
  "## Runtime workflow reference",
  REFERENCE_BOUNDARY,
  "- qkrpc via serve (HTTP → plugin), not per-call subprocesses. Sidebar cwd = workspace root for shell, qkrpc, workspace_program.",
  "- Existing V1 action bodies: qkrpc_action_open → Read/StrReplace/Write program.source.yaml/files → qkrpc_action_save dryRun=true → dryRun=false. Preserve sidecars/baseline; no force/retry after conflict or partial save. V2 uses native MCP. Creation, metadata, global subprograms and legacy JSON retain existing tools.",
  "- Disposable workspace files (test data, patch JSON, downloads, one-off scripts) → `.local/` under cwd (gitignored). NOT workspace root or tracked source trees.",
  "- Header shows RPC status; no connectivity probe tool.",
  "- When available, Shell prepends qkrpc and rg to PATH. A connectivity failure may use qkrpc_wait only if the current catalog permits it; never use Shell ping/probe/serve loops.",
  "- On connectivity_failure / qkrpc unavailable: tell user (Quicker + QuickerRpc plugin + serve). STOP — no Shell ping/probe/serve/build.ps1/qkrpc CLI workaround unless user explicitly asks to fix the environment.",
  "- Action refs: `<qka id=\"uuid\">Title</qka>` inline mention (UI chip); `<qka-link id=\"uuid\" use=\"run,edit,...\"/>` operation bar. NO identical retry on transient_error/timeout.",
  "",
  SEARCH_STRATEGY_PROMPT,
  "",
  TOOL_WORKFLOW_REFERENCE,
  "",
  WORKBENCH_AGENT_PROMPT,
  "",
  "## Capabilities",
  "Use the current executable catalog and the SDK definitions supplied for this call. Intent, mode names and tool packs do not add tools. A schema may be slimmed; request details only through a discovery tool that is actually present.",
  "",
  "## Skills",
  "Preloaded skill essentials below (hard rules + P4 pick); full text via docs search/get or Read skill path. On-demand skills listed in ## On-demand skills. Tool packs via list_tools action=bundles.",
);

const ASK_SYSTEM_INSTRUCTIONS = prompt(
  "## Role",
  "QuickerAgent Ask — read-only assistant. Answer questions, explain actions/steps, and explore the workspace without making changes.",
  "",
  "## Communication",
  "- Reply in the user's language (default Chinese). Never expose tool names, CLI, or JSON shapes in user-facing text.",
  "- Describe findings plainly; execute read tools silently. Be concise.",
  "- Action query tables render in UI — never paste markdown tables.",
  "",
  ASK_EXECUTION_PROMPT,
  "",
  "## Runtime",
  REFERENCE_BOUNDARY,
  "- Sidebar cwd bounds local reads; live Designer observations use the explicitly selected Session. The current execution catalog describes the available read ports.",
  "- On connectivity_failure: brief error + check Quicker/plugin/serve. No shell workarounds.",
  "",
  SEARCH_STRATEGY_PROMPT,
  "",
  "## Capabilities (read-only)",
  "**Explore**: use only this turn's selected tools and operation constraints (list_tools). Local workspace reads use an explicit read-only port; live Designer reads use the selected Session. Schema fields alone do not authorize an operation.",
  "**Quicker**: consult the current catalog for available connection-only read ports. Do not infer access from a read-like name, product grouping or an earlier tool catalog; unavailable operations require Agent mode or an appropriate read port.",
  "Web search and clarification are available only if their tools occur in this call's executable catalog. If absent, explain the limitation or ask in the response. Browser automation remains outside Ask because its adapter may start a runtime or create a session.",
  "",
  "## Out of scope → Agent mode",
  "Writes, patches, Shell, runs/debug, settings apply/set, delete, llm_settings, task subagents, browser_to_action.",
  "When the user clearly wants execution or edits, tell them to switch to Agent mode.",
);

const LAUNCHER_SYSTEM_INSTRUCTIONS_CORE = prompt(
  "## Role",
  "QuickerAgent launcher — fast global-shortcut surface. Act immediately; one short sentence after success.",
  "",
  "## Communication",
  "User language (default Chinese). No tool/CLI/JSON exposure.",
  "",
  LAUNCHER_EXECUTION_PROMPT,
  "",
  TOOL_WORKFLOW_REFERENCE,
  "",
  "## Launcher workflow reference",
  REFERENCE_BOUNDARY,
  "launcher_resolve first for run/open when user did not @-mention an action. Execute next only when present (high confidence); if disambiguationRequired or autoRunBlocked — ask_question, never guess qkrpc_action_run.",
  "Query: several | synonyms + * wildcards; read match.term/match.on and missedTerms. qkrpc_action_run/debug/float only after explicit user pick or @ mention. qkrpc_action_get/set_metadata/move; qkrpc_profile_*; web_search.",
  "No workspace_program / step_runner_* here. delete on explicit ask.",
  "launcher_command_cache save after stable success; run cached steps (≥85% match) without re-resolve.",
  "<qka id=\"uuid\"> → qkrpc_action run/debug/edit.",
);

export const LAUNCHER_SYSTEM_INSTRUCTIONS = prompt(
  LAUNCHER_SYSTEM_INSTRUCTIONS_CORE,
  "",
  "## Out of scope → main QuickerAgent",
  "workspace_program, qkrpc_step_runner_*, llm_settings; multi-step disk authoring.",
  "On qkrpc fail: brief error + check Quicker/plugin/serve. NO Shell connectivity workarounds.",
  "",
  ACTION_LINK_SUMMARY_PROMPT,
);

export async function buildSystemInstructions(
  workingDirectory?: string,
  mode: ChatMode = "agent",
  catalog?: CurrentToolCatalog,
  mcpCatalogs?: readonly McpServerCatalog[],
): Promise<string> {
  const cwd = workingDirectory?.trim();
  const base =
    mode === CHAT_MODE_LAUNCHER
      ? LAUNCHER_SYSTEM_INSTRUCTIONS
      : mode === CHAT_MODE_ASK
        ? ASK_SYSTEM_INSTRUCTIONS
        : SYSTEM_INSTRUCTIONS;

  const parts = [base, "", catalog
    ? formatCurrentToolCatalogSystem(catalog.tools, catalog, mcpCatalogs)
    : "## Current executable tools\nThe execution catalog was not supplied. Tool availability and operation constraints are unknown; reference material does not establish them."];

  if (mode !== CHAT_MODE_LAUNCHER) {
    const [{ formatAuthoringSkillForPrompt }, catalogMod, promptMod] =
      await Promise.all([
        import("@/lib/action-authoring-docs"),
        import("@/lib/agent-skills/prompt-catalog"),
        import("@/lib/agent-skills/prompt"),
      ]);
    const {
      formatPreloadedSkillsEssentialsForPrompt,
      isPreloadedSkillBodyInPromptEnabled,
    } = catalogMod;
    const { formatSkillCatalogForPrompt } = promptMod;
    const skillBlock = isPreloadedSkillBodyInPromptEnabled()
      ? await formatAuthoringSkillForPrompt()
      : await formatPreloadedSkillsEssentialsForPrompt(cwd);
    if (skillBlock) {
      parts.push("", skillBlock);
      if (isPreloadedSkillBodyInPromptEnabled()) {
        parts.push("", "### Post-patch summary", ACTION_LINK_SUMMARY_PROMPT);
      }
    }
    const catalog = await formatSkillCatalogForPrompt(cwd);
    if (catalog) {
      parts.push("", catalog);
    }
  }

  if (cwd && mode !== CHAT_MODE_LAUNCHER) {
    const {
      discoverAgentDefs,
      formatSubagentsCatalogBlock,
      formatWorkspaceInstructionsForPrompt,
      loadWorkspaceInstructions,
    } = await import("@/lib/agent-defs");
    const [workspaceInstructions, agentDefs] = await Promise.all([
      loadWorkspaceInstructions(cwd),
      discoverAgentDefs(cwd),
    ]);
    if (workspaceInstructions) {
      parts.push(
        "",
        formatWorkspaceInstructionsForPrompt(workspaceInstructions, { cwd }),
      );
    }
    if (mode !== CHAT_MODE_ASK && catalog && Object.hasOwn(catalog.tools, "task")) {
      const subagentBlock = formatSubagentsCatalogBlock(agentDefs.agents);
      if (subagentBlock) {
        parts.push("", subagentBlock);
      }
    }
  }

  if (cwd) {
    parts.push(
      "",
      "## cwd",
      `qkrpc cwd: ${cwd}`,
      `Scratch/temp path: \`${cwd}/.local/\` (create as needed; gitignored).`,
    );
  }
  return parts.join("\n");
}
