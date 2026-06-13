import type { ActionVariable } from "@/lib/action-editor/types/common";
import {
  pickNativeTextToolFiles,
  pickNativeTextToolFolder,
  pickNativeTextToolSavePath,
} from "./nativeTextToolDialogs";
import { actionPickerModeForTool } from "./textToolActionPicker";
import { keyCaptureModeForTool } from "./textToolSendKeys";

/** Tools handled locally in ParamTextToolsStrip (web dialog / Tauri / browser). */
export const WEB_TEXT_TOOL_IDS = new Set([
  "SelectSingleFile",
  "SelectMultiFile",
  "SelectSingleFolder",
  "SelectSavePath",
  "ColorPicker",
  "ColorPickerArgb",
  "SelectKeyName",
  "SelectKeyCode",
  "SelectSendKeysData",
  "BoolExpressionHelper",
  "SelectActionId",
  "SelectActionName",
  "EditInCodeWindow",
]);

export function isWebTextTool(toolId: string): boolean {
  return WEB_TEXT_TOOL_IDS.has(toolId);
}

/** Desktop-only tools that can run via qkrpc plugin when Quicker is online. */
export function isQkrpcTextTool(toolId: string): boolean {
  if (!toolId.trim() || toolId === "Na") {
    return false;
  }
  return !isWebTextTool(toolId);
}

export type TextToolDialogKind =
  | "color"
  | "colorArgb"
  | "savePath"
  | "keyCapture"
  | "boolExpression"
  | "actionPicker"
  | "editInCode";

export function resolveTextToolDialogKind(toolId: string): TextToolDialogKind | null {
  if (toolId === "EditInCodeWindow") return "editInCode";
  if (toolId === "ColorPicker") return "color";
  if (toolId === "ColorPickerArgb") return "colorArgb";
  if (toolId === "SelectSavePath") return "savePath";
  if (keyCaptureModeForTool(toolId)) return "keyCapture";
  if (toolId === "BoolExpressionHelper") return "boolExpression";
  if (actionPickerModeForTool(toolId)) return "actionPicker";
  return null;
}

export type RunBrowserFileTextToolResult =
  | { handled: true; value: string }
  | { handled: false };

/** Try Tauri-native pickers before falling back to browser file input / dialogs. */
export async function runNativeFileTextTool(toolId: string): Promise<RunBrowserFileTextToolResult> {
  if (toolId === "SelectSingleFile") {
    const paths = await pickNativeTextToolFiles(false);
    if (!paths || paths.length === 0) {
      return { handled: false };
    }
    return { handled: true, value: paths[0] ?? "" };
  }
  if (toolId === "SelectMultiFile") {
    const paths = await pickNativeTextToolFiles(true);
    if (!paths || paths.length === 0) {
      return { handled: false };
    }
    return { handled: true, value: paths.join(";") };
  }
  if (toolId === "SelectSingleFolder") {
    const path = await pickNativeTextToolFolder();
    if (!path) {
      return { handled: false };
    }
    return { handled: true, value: path };
  }
  if (toolId === "SelectSavePath") {
    const path = await pickNativeTextToolSavePath();
    if (!path) {
      return { handled: false };
    }
    return { handled: true, value: path };
  }
  return { handled: false };
}

export const BOOL_EXPRESSION_SNIPPETS: readonly { label: string; value: string }[] = [
  { label: "恒真", value: "true" },
  { label: "恒假", value: "false" },
  { label: "非空文本", value: '$= {text} != ""' },
  { label: "数值大于 0", value: "$= {num} > 0" },
  { label: "包含子串", value: '$= {text}.Contains("keyword")' },
];

export function buildBoolExpressionFromVariable(variable: ActionVariable): string {
  const key = (variable.key ?? "").trim();
  if (!key) {
    return "true";
  }
  return `$= {${key}}`;
}
