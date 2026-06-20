import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  getActionAuthoringDoc,
  getActionAuthoringReference,
  getActionAuthoringSectionSnippet,
  listActionAuthoringTopics,
  searchActionAuthoringDocs,
} from "@/lib/action-authoring-docs";
import { buildSearchSnippet } from "@/lib/action-authoring-docs-search";
import {
  DOCS_AGENT_ROUTING_HINT,
  DOCS_SEARCH_SCOPES,
  groupTopicsByLayer,
} from "@/lib/action-authoring-docs.shared";
import {
  attachToolFeedback,
  formatLocalToolResult,
} from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";
import { DOCS_TOOL } from "@/lib/docs-tool";
import { buildAgentTurnState } from "@/lib/agent-turn-state";
import {
  rankPatternSkills,
  rankPatternSkillsScored,
  shouldBlockDocsForPreloadedSkills,
} from "@/lib/agent-skills/skill-intent-preload";
import { incrementDocsCallCountThisTurn } from "@/lib/program-turn-context";
import { getRequestLastUserText } from "@/lib/qkrpc-request-context";

/** Public actions for the consolidated docs tool. */
const docsActionSchema = z.enum(["search", "get", "index"]);

const DOCS_SEARCH_HINT = DOCS_AGENT_ROUTING_HINT;

export type DocsToolInput = {
  action: z.infer<typeof docsActionSchema> | "grep";
  topic?: string;
  /** Legacy / docs_get_reference only — not in agent tool schema. */
  reference?: string;
  section?: string;
  query?: string;
  scope?: (typeof DOCS_SEARCH_SCOPES)[number];
  limit?: number;
};

function normalizeDocsAction(
  action: DocsToolInput["action"],
): z.infer<typeof docsActionSchema> {
  if (action === "grep") return "search";
  return action;
}

function maybeBlockDocsForAuthoring(): Record<string, unknown> | null {
  const userText = getRequestLastUserText()?.trim();
  if (!userText) {
    return null;
  }
  const turnState = buildAgentTurnState({
    actionScope: { pinnedLatestAll: [] },
    chatMode: "agent",
    enabledToolIds: ["docs"],
    userText,
  });
  if (turnState.intent !== "action_authoring") {
    return null;
  }
  const scored = rankPatternSkillsScored({
    userText,
    intent: turnState.intent,
  });
  if (!shouldBlockDocsForPreloadedSkills(scored)) {
    return null;
  }
  const matchedSkills = rankPatternSkills({
    userText,
    intent: turnState.intent,
  });
  incrementDocsCallCountThisTurn();
  const message =
    "docs blocked — intent-matched pattern skills and quicker-eval-expression are preloaded; use qkrpc_step_runner_get for step keys.";
  return attachToolFeedback(
    formatLocalToolResult(
      {
        action: "docs-blocked",
        docsAction: "blocked",
        success: false,
        errorMessage: message,
        matchedSkills,
      },
      false,
      message,
    ),
    {
      summary: message,
      retryable: false,
      nextActions: [
        {
          tool: "qkrpc_step_runner_get",
          priority: "required",
          reason: "Fetch step schemas from the first search — do not call docs again.",
        },
      ],
    },
  );
}

function applyDocsAuthoringTurnFeedback(
  result: Record<string, unknown>,
): Record<string, unknown> {
  incrementDocsCallCountThisTurn();
  return result;
}

export async function executeDocsTool(
  input: DocsToolInput,
): Promise<Record<string, unknown>> {
  const blocked = maybeBlockDocsForAuthoring();
  if (blocked) {
    return blocked;
  }
  return applyDocsAuthoringTurnFeedback(await executeDocsToolInner(input));
}

async function executeDocsToolInner(
  input: DocsToolInput,
): Promise<Record<string, unknown>> {
  const action = normalizeDocsAction(input.action);

  switch (action) {
    case "index": {
      const topics = await listActionAuthoringTopics();
      const layerGroups = groupTopicsByLayer(topics);
      return formatLocalToolResult({
        action: "docs-index",
        docsAction: "index",
        success: true,
        topics,
        topicsByLayer: Object.fromEntries(
          layerGroups.map((g) => [g.layer, g.topics]),
        ),
        layerOrder: layerGroups.map((g) => g.layer),
        layerGroups,
        hint: DOCS_SEARCH_HINT,
      });
    }
    case "search": {
      const query = input.query?.trim();
      if (!query) {
        return formatLocalToolResult(
          {
            action: "docs-search",
            docsAction: "search",
            errorMessage: "query is required when action=search",
          },
          false,
          "query is required when action=search",
        );
      }
      const search = await searchActionAuthoringDocs(query, input.limit ?? 10, {
        scope: input.scope,
      });
      return formatLocalToolResult({
        action: "docs-search",
        docsAction: "search",
        success: true,
        ...search,
      });
    }
    case "get": {
      const topic = input.topic?.trim();
      if (!topic) {
        return formatLocalToolResult(
          {
            action: "docs-get",
            docsAction: "get",
            errorMessage: "topic is required when action=get",
          },
          false,
          "topic is required when action=get",
        );
      }

      const ref = input.reference?.trim();
      const section = input.section?.trim();

      // Legacy docs_get_reference path — prefer docs search for agents.
      if (ref) {
        if (section) {
          const sectionResult = await getActionAuthoringSectionSnippet(
            topic,
            section,
            ref,
          );
          if (!sectionResult.ok) {
            return formatLocalToolResult(
              {
                action: "docs-get",
                docsAction: "get",
                errorMessage: sectionResult.error,
                availableTopics: sectionResult.availableTopics,
                availableReferences: sectionResult.availableReferences,
                hint: DOCS_SEARCH_HINT,
              },
              false,
              sectionResult.error,
            );
          }
          return formatLocalToolResult({
            action: "docs-get",
            docsAction: "get",
            success: true,
            mode: "snippet",
            topic: sectionResult.topic,
            reference: sectionResult.reference,
            section: sectionResult.section,
            title: sectionResult.title,
            snippet: sectionResult.snippet,
            hint: DOCS_SEARCH_HINT,
          });
        }

        const result = await getActionAuthoringReference(topic, ref);
        if (!result.ok) {
          return formatLocalToolResult(
            {
              action: "docs-get",
              docsAction: "get",
              errorMessage: result.error,
              availableTopics: result.availableTopics,
              availableReferences: result.availableReferences,
              hint: DOCS_SEARCH_HINT,
            },
            false,
            result.error,
          );
        }

        return formatLocalToolResult({
          action: "docs-get",
          docsAction: "get",
          success: true,
          mode: "snippet",
          topic: result.doc.topic,
          reference: result.doc.reference,
          title: result.doc.title,
          snippet: buildSearchSnippet(result.doc.markdown, [], undefined),
          hint: DOCS_SEARCH_HINT,
        });
      }

      const result = await getActionAuthoringDoc(topic);
      if (!result.ok) {
        return formatLocalToolResult(
          {
            action: "docs-get",
            docsAction: "get",
            errorMessage: result.error,
            availableTopics: result.availableTopics,
          },
          false,
          result.error,
        );
      }

      return formatLocalToolResult({
        action: "docs-get",
        docsAction: "get",
        success: true,
        mode: "full",
        topic: result.doc.topic,
        title: result.doc.title,
        description: result.doc.description,
        markdown: result.doc.markdown,
        ...(result.doc.schema ? { schema: result.doc.schema } : {}),
        hint: "Full topic markdown/schema. Prefer docs get for known topic ids.",
      });
    }
    default: {
      const _exhaustive: never = action;
      return formatLocalToolResult(
        { action: "docs", errorMessage: `Unknown action: ${String(_exhaustive)}` },
        false,
        "Unknown docs action",
      );
    }
  }
}

export const DOCS_TOOL_DEF = tool({
  description: [
    "Quicker action authoring guides (indexed).",
    DOCS_AGENT_ROUTING_HINT,
    "search(query, scope?, limit?) → items[].snippet when topic id is unknown.",
    "get(topic) → full topic (workflow guide or schema e.g. action-data-schema returns schema + markdown).",
    "index() → topic catalog by layer.",
    "scope: references (step-modules) | workflows | all.",
    "NOT qkrpc_action_query, NOT web_search.",
  ].join(" "),
  inputSchema: z.object({
    action: docsActionSchema.describe("search | get | index"),
    query: z
      .string()
      .optional()
      .describe("Required for search — keywords (fuzzy; sys:http, 中文)"),
    scope: z
      .enum(DOCS_SEARCH_SCOPES)
      .optional()
      .describe("search filter: references | workflows | all (default all)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("search result cap (default 10)"),
    topic: z
      .string()
      .optional()
      .describe("Required for get — topic id (e.g. authoring-workflow)"),
  }),
  execute: async (input) =>
    formatToolResultForAgent(DOCS_TOOL, input, await executeDocsTool(input)),
});

export { DOCS_TOOL };
