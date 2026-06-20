import { DOCS_AGENT_ROUTING_HINT } from "@/lib/action-authoring-docs.shared";

/**
 * Search-first guidance for QuickerAgent system prompt.
 * Keep compact; tool-specific syntax lives in tool descriptions.
 */
const SEARCH_STRATEGY_ROWS = [
  "| Domain | Search | Then | Not |",
  "|--------|--------|------|-----|",
  "| Quicker action id / uses: refs | qkrpc_action_query | run/get/edit | invent GUID |",
  "| Global subprogram (name / uses: refs) | qkrpc_subprogram_query | get → callIdentifier | guess name |",
  "| Step module key | qkrpc_step_runner_search | qkrpc_step_runner_get | guess inputParams |",
  "| data.json schema / steps[] / variables[] | docs get action-data-schema | docs search; guess JSON | invent wire shape |",
  "| Known authoring topic (workflow/schema) | docs get(topic) | search when id unknown | invent syntax |",
  "| Authoring keyword / module ref (topic unknown) | docs search → items[].snippet | docs get when topic known | invent syntax |",
  "| Icons | qkrpc_fa search | set_metadata | guess fa: names |",
  "| cwd / repo file contents | Grep | Read (single path) | invent paths |",
  "| Internet / vendor APIs | web_search | browser if need page | docs; qkrpc_action_query |",
] as const;

export const SEARCH_STRATEGY_PROMPT = [
  "## Search-first",
  "Uncertain id/key/syntax/API → search, then act. Weak or empty hits → re-query with | synonyms (中文|english), wildcards, or broader terms; search again before guessing.",
  `Authoring: ${DOCS_AGENT_ROUTING_HINT} Quicker data: query tools, not web_search.`,
  SEARCH_STRATEGY_ROWS.join("\n"),
].join("\n");
