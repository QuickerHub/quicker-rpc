import {
  parseActionMetadata,
  splitActionMetadataFields,
} from "@/lib/action-metadata";
import {
  isActionListTool,
  parseActionListFromQkrpcData,
} from "@/lib/action-list";
import {
  isActionProjectsTool,
  parseActionProjectsFromToolData,
} from "@/lib/action-projects";
import { parseWorkspaceToolDisplay } from "@/lib/action-project-display";
import { isFaSearchTool, parseFaSearchFromQkrpcData } from "@/lib/fa-search";
import {
  isStepRunnerGetTool,
  isStepRunnerSearchTool,
  parseStepRunnerGetFromQkrpcData,
  parseStepRunnerSearchResult,
} from "@/lib/step-runner-tool";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { parseBrowserToolResultView } from "@/lib/browser-tool-result";
import { isShellToolName } from "@/lib/host-tool-constants";
import { isStructuredToolResult } from "@/lib/tool-result";
import { parseProgramDiagnosticsFromToolData } from "@/lib/program-diagnostics-view";
import {
  parseWorkspaceFileReadPayload,
  workspaceFileToolHasPopupVisual,
} from "@/lib/workspace-file-tool";
import { docsToolHasPopupVisual } from "@/lib/docs-tool-view";

/** Whether the popup can show a structured visual body (not only raw JSON). */
export function toolPopupHasVisualView(
  toolName: string,
  input?: unknown,
  output?: unknown,
): boolean {
  if (isShellToolName(toolName)) {
    return input !== undefined || output !== undefined;
  }

  if (toolName === BROWSER_TOOL && parseBrowserToolResultView(output)) {
    return true;
  }

  if (docsToolHasPopupVisual(toolName, input, output)) {
    return true;
  }

  if (workspaceFileToolHasPopupVisual(toolName, input, output)) {
    return true;
  }

  if (isStructuredToolResult(output)) {
    const data = output.data;
    if (parseProgramDiagnosticsFromToolData(data)) return true;
    if (parseActionListFromQkrpcData(toolName, data, input)) return true;
    if (isActionProjectsTool(toolName, input) && parseActionProjectsFromToolData(data)) {
      return true;
    }
    if (isStepRunnerSearchTool(toolName) && parseStepRunnerSearchResult(data, input)) {
      return true;
    }
    if (isStepRunnerGetTool(toolName) && parseStepRunnerGetFromQkrpcData(data, input)) {
      return true;
    }
    if (isFaSearchTool(toolName) && parseFaSearchFromQkrpcData(data)) return true;

    const workspaceDisplay = output.ok ? parseWorkspaceToolDisplay(data) : null;
    if (
      workspaceDisplay
      && (
        workspaceDisplay.syncError
        || workspaceDisplay.workspaceSynced
        || workspaceDisplay.actionId
        || workspaceDisplay.projectDirectory
      )
    ) {
      return true;
    }

    if (
      output.ok
      && typeof data === "object"
      && data !== null
      && !Array.isArray(data)
    ) {
      const meta = parseActionMetadata(data);
      if (meta) {
        const { rest } = splitActionMetadataFields(data);
        if (meta.id?.trim() || Object.keys(rest).length > 0) return true;
      }
      if ((data as Record<string, unknown>).action === "ping") return true;
      if (parseWorkspaceFileReadPayload(data)) return true;
    }

    if (!output.ok) return true;
  }

  if (
    input !== undefined
    && typeof input === "object"
    && input !== null
    && !Array.isArray(input)
    && parseActionMetadata(input)
  ) {
    const { rest } = splitActionMetadataFields(input as Record<string, unknown>);
    if (Object.keys(rest).length > 0) return true;
  }

  return isActionListTool(toolName, input);
}
