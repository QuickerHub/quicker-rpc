import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  getActionAuthoringDoc,
  getActionAuthoringReference,
  listActionAuthoringTopics,
  searchActionAuthoringDocs,
} from "@/lib/action-authoring-docs";
import { formatLocalToolResult } from "@/lib/tool-result";
import { DOCS_TOOL } from "@/lib/docs-tool";

const docsActionSchema = z.enum(["get", "search", "index"]);

export type DocsToolInput = {
  action: z.infer<typeof docsActionSchema>;
  topic?: string;
  reference?: string;
  query?: string;
  limit?: number;
};

export async function executeDocsTool(
  input: DocsToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "index": {
      const topics = await listActionAuthoringTopics();
      return formatLocalToolResult({
        action: "docs-index",
        docsAction: "index",
        success: true,
        topics,
      });
    }
    case "search": {
      const search = await searchActionAuthoringDocs(input.query, input.limit ?? 10);
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
      if (ref) {
        const result = await getActionAuthoringReference(topic, ref);
        if (!result.ok) {
          return formatLocalToolResult(
            {
              action: "docs-get",
              docsAction: "get",
              errorMessage: result.error,
              availableTopics: result.availableTopics,
              availableReferences: result.availableReferences,
            },
            false,
            result.error,
          );
        }
        return formatLocalToolResult({
          action: "docs-get",
          docsAction: "get",
          success: true,
          topic: result.doc.topic,
          reference: result.doc.reference,
          title: result.doc.title,
          description: result.doc.description,
          markdown: result.doc.markdown,
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
        topic: result.doc.topic,
        title: result.doc.title,
        description: result.doc.description,
        markdown: result.doc.markdown,
      });
    }
    default: {
      const _exhaustive: never = input.action;
      return formatLocalToolResult(
        { action: "docs", errorMessage: `Unknown action: ${String(_exhaustive)}` },
        false,
        "Unknown docs action",
      );
    }
  }
}

export const DOCS_TOOL_DEF = tool({
  description:
    "Local Quicker action authoring guide (single skill). "
    + "action=get: read topic (optional reference appendix id); "
    + "action=search: keyword search; action=index: list topics. "
    + "Start with get topic authoring-workflow or overview.",
  inputSchema: z.object({
    action: docsActionSchema.describe(
      "get: read topic; search: keyword; index: list all topics",
    ),
    topic: z
      .string()
      .optional()
      .describe("Topic id for action=get (required for get)"),
    reference: z
      .string()
      .optional()
      .describe("Appendix id under references/{topic}/ for action=get"),
    query: z.string().optional().describe("Keyword for action=search"),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: executeDocsTool,
});

export { DOCS_TOOL };
