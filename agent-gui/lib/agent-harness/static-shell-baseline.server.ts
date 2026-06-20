import "server-only";

import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_AGENT, resolveEnabledToolsForChatMode } from "@/lib/chat-mode";
import { createChatSystemBuilder, selectChatTools } from "@/lib/agent-turn-runtime";
import { resolveFullSchemaToolIdsForTurn } from "@/lib/chat-tool-selection";
import {
  SYSTEM_INSTRUCTIONS,
  LAUNCHER_SYSTEM_INSTRUCTIONS,
  buildSystemInstructions,
} from "@/lib/instructions";
import { TOOL_ROUTING_PROMPT } from "@/lib/tool-routing";
import { isPreloadedSkillBodyInPromptEnabled } from "@/lib/agent-skills/prompt-catalog";
import { isWorkspaceRulesFullInPromptEnabled } from "@/lib/agent-defs/workspace-instructions-format";
import { isToolResultAgentViewCompressionEnabled } from "@/lib/tool-result-agent-view";
import { defaultEnabledToolIds } from "@/lib/tool-registry";
import { buildAgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import {
  segmentFromText,
  summarizeStaticShellBaseline,
  type StaticShellBaselineReport,
  type StaticShellSegment,
} from "@/lib/agent-harness/static-shell-baseline";
import {
  countSlimExtendedTools,
  isSlimToolSchemasEnabled,
  slimToolsForModel,
} from "@/lib/agent-harness/model-tool-definitions";
import { estimateToolsTokens } from "@/lib/agent-harness/context-report";

export type MeasureStaticShellBaselineOptions = {
  cwd?: string;
  chatMode?: ChatMode;
  enabledToolIds?: string[];
  modelId?: string;
  /** Sample user text to measure intent-matched skill preload segment. */
  authoringSampleUserText?: string;
};

async function collectSystemSegments(
  cwd: string,
  chatMode: ChatMode,
  authoringSampleUserText = "",
): Promise<StaticShellSegment[]> {
  const segments: StaticShellSegment[] = [];

  const coreBase =
    chatMode === "launcher"
      ? LAUNCHER_SYSTEM_INSTRUCTIONS
      : await buildSystemInstructions(undefined, chatMode);
  segments.push(
    segmentFromText("core-instructions", "Core instructions (no cwd)", coreBase),
  );
  segments.push(
    segmentFromText("tool-routing", "Tool routing table", TOOL_ROUTING_PROMPT),
  );

  if (chatMode !== "launcher") {
    const [{ formatAuthoringSkillForPrompt }, catalogMod, promptMod] =
      await Promise.all([
        import("@/lib/action-authoring-docs"),
        import("@/lib/agent-skills/prompt-catalog"),
        import("@/lib/agent-skills/prompt"),
      ]);
    const {
      formatPreloadedSkillsEssentialsForPrompt,
      isPreloadedSkillBodyInPromptEnabled: isFullSkills,
    } = catalogMod;
    const { formatSkillCatalogForPrompt } = promptMod;

    const skillBlock = isFullSkills()
      ? await formatAuthoringSkillForPrompt()
      : await formatPreloadedSkillsEssentialsForPrompt(cwd);
    if (skillBlock) {
      segments.push(
        segmentFromText(
          isFullSkills() ? "skills-preload-full" : "skills-preload-essentials",
          isFullSkills() ? "Preloaded skills (full)" : "Preloaded skills (essentials)",
          skillBlock,
        ),
      );
    }

    const catalog = await formatSkillCatalogForPrompt();
    if (catalog) {
      segments.push(
        segmentFromText("skills-available", "Available skills catalog", catalog),
      );
    }

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
      const rulesBlock = formatWorkspaceInstructionsForPrompt(
        workspaceInstructions,
        { cwd },
      );
      segments.push(
        segmentFromText(
          isWorkspaceRulesFullInPromptEnabled()
            ? "workspace-rules-full"
            : "workspace-rules-summary",
          isWorkspaceRulesFullInPromptEnabled()
            ? "Workspace AGENTS.md (full)"
            : "Workspace AGENTS.md (summary)",
          rulesBlock,
        ),
      );
    }
    const subagentBlock = formatSubagentsCatalogBlock(agentDefs.agents);
    if (subagentBlock) {
      segments.push(
        segmentFromText("subagents", "Subagents catalog", subagentBlock),
      );
    }

    const sample = authoringSampleUserText.trim();
    if (sample) {
      const { formatIntentMatchedSkillsForPrompt } = await import(
        "@/lib/agent-skills/skill-intent-preload"
      );
      const intentBlock = await formatIntentMatchedSkillsForPrompt({
        userText: sample,
        chatMode,
        cwd,
      });
      if (intentBlock) {
        segments.push(
          segmentFromText(
            "skills-intent-matched",
            "Intent-matched skills (sample turn)",
            intentBlock,
          ),
        );
      }
    }
  }

  segments.push(
    segmentFromText("cwd-block", "cwd footer", [
      "## cwd",
      `qkrpc cwd: ${cwd}`,
      `Scratch/temp path: \`${cwd}/.local/\` (create as needed; gitignored).`,
    ].join("\n")),
  );

  return segments;
}

/** Measure empty-turn static context (system segments + registered tool schemas). */
export async function measureStaticShellBaseline(
  options?: MeasureStaticShellBaselineOptions,
): Promise<StaticShellBaselineReport> {
  const cwd = resolveEffectiveWorkingDirectory(options?.cwd);
  const chatMode = options?.chatMode ?? CHAT_MODE_AGENT;
  const modelId = options?.modelId ?? "gpt-4.1";
  const authoringSampleUserText = options?.authoringSampleUserText?.trim() ?? "";
  const enabledToolIds = resolveEnabledToolsForChatMode(
    chatMode,
    options?.enabledToolIds,
    defaultEnabledToolIds,
  );

  return runWithAgentRequestContextAsync({ cwd, chatMode }, async () => {
    const segments = await collectSystemSegments(
      cwd,
      chatMode,
      authoringSampleUserText,
    );

    const buildSystem = await createChatSystemBuilder({
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
      chatMode,
      cwd,
      enabledToolIds,
      launcherUserText: authoringSampleUserText,
      modelId,
      repairedMessages: [],
      runtimeSnapshot: buildAgentRuntimeSnapshot({
        actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
        chatMode,
        enabledToolIds,
        messages: [],
        userText: authoringSampleUserText,
      }),
      titleManual: true,
      titleTest: false,
    });

    const systemPrompt = buildSystem({ systemSuffix: undefined });
    const fullTools = selectChatTools({
      chatMode,
      enabledToolIds,
      titleTest: false,
      userText: authoringSampleUserText,
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
    });
    const fullSchemaToolIds = resolveFullSchemaToolIdsForTurn({
      chatMode,
      enabledToolIds,
      titleTest: false,
      userText: authoringSampleUserText,
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
    });
    const slimEnabled = isSlimToolSchemasEnabled();
    const modelTools = slimToolsForModel(fullTools, fullSchemaToolIds);
    const toolDefinitionTokensFull = slimEnabled
      ? estimateToolsTokens(fullTools)
      : undefined;

    return summarizeStaticShellBaseline({
      cwd,
      chatMode,
      harnessFlags: {
        preloadSkillsFull: isPreloadedSkillBodyInPromptEnabled(),
        workspaceRulesFull: isWorkspaceRulesFullInPromptEnabled(),
        toolResultCompression: isToolResultAgentViewCompressionEnabled(),
        slimToolSchemas: slimEnabled,
      },
      segments,
      systemPrompt,
      tools: modelTools,
      enabledToolIds,
      toolDefinitionTokensFull,
      slimExtendedToolCount: slimEnabled
        ? countSlimExtendedTools(enabledToolIds, fullSchemaToolIds)
        : undefined,
    });
  });
}

/** Sync baseline for agent mode core block only (no disk I/O). */
export function measureCoreInstructionsChars(): number {
  return SYSTEM_INSTRUCTIONS.length;
}
