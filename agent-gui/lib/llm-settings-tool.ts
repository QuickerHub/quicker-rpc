import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import { buildLlmOptionsResponse } from "@/lib/llm-options";
import {
  createCustomProfile,
  deleteCustomProfile,
  getCustomProfile,
  listAllCustomProfiles,
  setStoredActiveSelection,
  toPublicProfile,
  updateCustomProfile,
  type LlmProfilePatch,
} from "@/lib/llm-profiles";
import { parseLlmSelection } from "@/lib/llm-selection";
import { isLlmSelectionConfigured } from "@/lib/llm";

const actionSchema = z.enum([
  "list",
  "get",
  "create",
  "update",
  "delete",
  "set_active",
]);

export const LLM_SETTINGS_TOOL = "llm_settings";

export const LLM_SETTINGS_TOOL_DEF = tool({
  description:
    "Manage agent-gui chat LLM profiles and active model. NOT Quicker app settings (quicker_settings). "
    + "Profiles = apiKey + baseURL + model ids. Built-in presets read-only; custom via create/update.",
  inputSchema: z.object({
    action: actionSchema.describe(
      "list: all profiles + options summary; get: one profile; "
      + "create/update/delete: profile CRUD; set_active: switch chat model",
    ),
    id: z.string().optional().describe("Profile id (get/update/delete)"),
    title: z.string().optional().describe("Display title for create/update"),
    description: z.string().optional().describe("Optional profile description"),
    apiKey: z.string().optional().describe("OpenAI-compatible API key"),
    baseURL: z
      .string()
      .optional()
      .describe("OpenAI-compatible base URL, e.g. https://api.openai.com/v1"),
    models: z
      .array(z.string())
      .optional()
      .describe("Model ids available on this endpoint"),
    defaultModel: z
      .string()
      .optional()
      .describe("Default model when selecting this profile"),
    hidden: z.boolean().optional().describe("Hide profile from model picker"),
    selection: z
      .string()
      .optional()
      .describe(
        "Active model selection for set_active (builtin id or profile:id/model)",
      ),
  }),
  execute: async (input) => {
    try {
      switch (input.action) {
        case "list": {
          const snapshot = buildLlmOptionsResponse();
          return formatLocalToolResult({
            action: "llm-settings-list",
            success: true,
            activeSelection: snapshot.activeSelection,
            defaultSelection: snapshot.defaultSelection,
            options: snapshot.options.map((o) => ({
              selection: o.selection,
              kind: o.kind,
              label: o.label,
              modelId: o.modelId,
              configured: o.configured,
            })),
            profiles: listAllCustomProfiles().map(toPublicProfile),
          });
        }
        case "get": {
          if (!input.id?.trim()) {
            return formatLocalToolResult(
              { action: "llm-settings-get", errorMessage: "id is required" },
              false,
              "id is required",
            );
          }
          const profile = getCustomProfile(input.id);
          if (!profile) {
            return formatLocalToolResult(
              { action: "llm-settings-get", errorMessage: "Profile not found" },
              false,
              "Profile not found",
            );
          }
          return formatLocalToolResult({
            action: "llm-settings-get",
            success: true,
            profile: toPublicProfile(profile),
          });
        }
        case "create": {
          const profile = createCustomProfile({
            ...(input.title?.trim() ? { title: input.title.trim() } : {}),
            apiKey: input.apiKey ?? "",
            baseURL: input.baseURL ?? "",
            models: input.models ?? [],
            ...(input.description?.trim()
              ? { description: input.description.trim() }
              : {}),
            defaultModel: input.defaultModel,
            hidden: input.hidden,
          });
          return formatLocalToolResult({
            action: "llm-settings-create",
            success: true,
            profile: toPublicProfile(profile),
          });
        }
        case "update": {
          if (!input.id?.trim()) {
            return formatLocalToolResult(
              { action: "llm-settings-update", errorMessage: "id is required" },
              false,
              "id is required",
            );
          }
          const patch: LlmProfilePatch = {};
          if (input.title !== undefined) patch.title = input.title;
          if (input.description !== undefined) patch.description = input.description;
          if (input.apiKey !== undefined) patch.apiKey = input.apiKey;
          if (input.baseURL !== undefined) patch.baseURL = input.baseURL;
          if (input.models !== undefined) patch.models = input.models;
          if (input.defaultModel !== undefined) patch.defaultModel = input.defaultModel;
          if (input.hidden !== undefined) patch.hidden = input.hidden;
          const profile = updateCustomProfile(input.id, patch);
          return formatLocalToolResult({
            action: "llm-settings-update",
            success: true,
            profile: toPublicProfile(profile),
          });
        }
        case "delete": {
          if (!input.id?.trim()) {
            return formatLocalToolResult(
              { action: "llm-settings-delete", errorMessage: "id is required" },
              false,
              "id is required",
            );
          }
          const ok = deleteCustomProfile(input.id);
          if (!ok) {
            return formatLocalToolResult(
              { action: "llm-settings-delete", errorMessage: "Profile not found" },
              false,
              "Profile not found",
            );
          }
          return formatLocalToolResult({
            action: "llm-settings-delete",
            success: true,
            id: input.id,
          });
        }
        case "set_active": {
          const selection = parseLlmSelection(input.selection);
          if (!selection) {
            return formatLocalToolResult(
              {
                action: "llm-settings-set-active",
                errorMessage: "Invalid selection",
              },
              false,
              "Invalid selection",
            );
          }
          if (!isLlmSelectionConfigured(selection)) {
            return formatLocalToolResult(
              {
                action: "llm-settings-set-active",
                errorMessage: "Selection is not configured",
              },
              false,
              "Selection is not configured",
            );
          }
          setStoredActiveSelection(selection);
          return formatLocalToolResult({
            action: "llm-settings-set-active",
            success: true,
            selection: input.selection,
          });
        }
        default:
          return formatLocalToolResult(
            { action: "llm-settings", errorMessage: "Unknown action" },
            false,
            "Unknown action",
          );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return formatLocalToolResult(
        { action: `llm-settings-${input.action}`, errorMessage: message },
        false,
        message,
      );
    }
  },
});
