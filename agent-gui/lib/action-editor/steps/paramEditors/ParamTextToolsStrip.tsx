"use client";

import { useCallback, useRef, useState, type ChangeEvent, type JSX } from "react";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import { TEXT_TOOL_CATALOG } from "./textToolCatalog";
import { parseParamTextToolIds } from "./stepRunnerInputParamUi";
import { TextToolDialogs, type TextToolDialogState } from "./TextToolDialogs";
import {
  isQkrpcTextTool,
  isWebTextTool,
  resolveTextToolDialogKind,
  runNativeFileTextTool,
} from "./textToolWebSupport";
import { runQkrpcTextTool } from "./textToolQkrpc";

export type ParamTextToolsStripProps = {
  textTools: string;
  /** Current bound field value (passed to Quicker pickers as currValue). */
  currentValue?: string;
  /** Insert or replace value in the bound field (desktop TextToolsControl). */
  onInsertValue: (value: string, mode: "replace" | "append" | "replaceAll") => void;
  variables?: ActionVariable[];
  disabled?: boolean;
};

const BROWSER_FILE_TOOLS = new Set([
  "SelectSingleFile",
  "SelectMultiFile",
  "SelectSingleFolder",
]);

function resolveToolLabel(toolId: string): string {
  const hit = TEXT_TOOL_CATALOG.find(
    (x) => x.value.localeCompare(toolId, "en", { sensitivity: "accent" }) === 0,
  );
  return hit?.label ?? toolId;
}

export function ParamTextToolsStrip({
  textTools,
  currentValue = "",
  onInsertValue,
  variables = [],
  disabled = false,
}: ParamTextToolsStripProps): JSX.Element | null {
  const ids = parseParamTextToolIds(textTools);
  const [dialogState, setDialogState] = useState<TextToolDialogState>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingToolRef = useRef<string | null>(null);

  const commitValue = useCallback(
    (value: string, mode: "replace" | "append" = "replace"): void => {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      onInsertValue(trimmed, mode);
    },
    [onInsertValue],
  );

  const openBrowserPicker = useCallback((toolId: string): void => {
    pendingToolRef.current = toolId;
    const input = fileInputRef.current;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    input.multiple = toolId === "SelectMultiFile";
    input.webkitdirectory = toolId === "SelectSingleFolder";
    input.accept = "";
    input.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const toolId = pendingToolRef.current;
      pendingToolRef.current = null;
      const files = event.target.files;
      event.target.value = "";
      if (!toolId || !files || files.length === 0) {
        return;
      }
      if (toolId === "SelectMultiFile") {
        const paths = Array.from(files)
          .map((f) => f.name)
          .filter((x) => x.length > 0);
        if (paths.length > 0) {
          commitValue(paths.join(";"));
        }
        return;
      }
      if (toolId === "SelectSingleFolder") {
        const first = files[0];
        if (first) {
          commitValue(first.webkitRelativePath.split("/")[0] ?? first.name);
        }
        return;
      }
      const first = files[0];
      if (first) {
        commitValue(first.name);
      }
    },
    [commitValue],
  );

  const openDialogForTool = useCallback((toolId: string): void => {
    const kind = resolveTextToolDialogKind(toolId);
    if (!kind) {
      return;
    }
    if (kind === "actionPicker") {
      setDialogState({ kind, toolId });
      return;
    }
    setDialogState({
      kind,
      toolId,
      initialValue: kind === "editInCode" ? currentValue : undefined,
      variables: kind === "boolExpression" ? variables : undefined,
    });
  }, [variables, currentValue]);

  const handleToolClick = useCallback(
    async (toolId: string): Promise<void> => {
      if (disabled) {
        return;
      }

      if (BROWSER_FILE_TOOLS.has(toolId)) {
        const native = await runNativeFileTextTool(toolId);
        if (native.handled) {
          commitValue(native.value);
          return;
        }
        openBrowserPicker(toolId);
        return;
      }

      if (toolId === "SelectSavePath") {
        const native = await runNativeFileTextTool(toolId);
        if (native.handled) {
          commitValue(native.value);
          return;
        }
        openDialogForTool(toolId);
        return;
      }

      if (isWebTextTool(toolId)) {
        openDialogForTool(toolId);
        return;
      }

      if (isQkrpcTextTool(toolId)) {
        const plugin = await runQkrpcTextTool(toolId, currentValue);
        if (plugin.status === "success") {
          commitValue(plugin.value);
          return;
        }
        if (plugin.status === "cancelled") {
          return;
        }
        if (plugin.status === "unavailable") {
          window.alert(
            `「${resolveToolLabel(toolId)}」需要 Quicker 桌面版在线（qkrpc 插件）。请启动 Quicker 后重试。`,
          );
          return;
        }
        if (plugin.status === "error") {
          window.alert(plugin.message);
          return;
        }
      }

      window.alert(`「${resolveToolLabel(toolId)}」需在 Quicker 桌面版步骤编辑器中使用。`);
    },
    [commitValue, currentValue, disabled, openBrowserPicker, openDialogForTool],
  );

  if (ids.length === 0) {
    return null;
  }

  return (
    <>
      <div className="step-param-texttools-strip" role="toolbar" aria-label="文本工具">
        <input
          ref={fileInputRef}
          type="file"
          className="step-param-texttools-file-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChange}
        />
        {ids.map((toolId) => {
          const webCapable = isWebTextTool(toolId);
          const pluginCapable = isQkrpcTextTool(toolId);
          const titleSuffix = webCapable
            ? ""
            : pluginCapable
              ? "（Quicker 插件）"
              : "（仅桌面版）";
          return (
            <button
              key={toolId}
              type="button"
              className={`step-param-texttools-btn${
                webCapable || pluginCapable ? " step-param-texttools-btn--web" : ""
              }`}
              title={`${resolveToolLabel(toolId)}${titleSuffix}`}
              disabled={disabled}
              onClick={() => void handleToolClick(toolId)}
            >
              {resolveToolLabel(toolId)}
            </button>
          );
        })}
      </div>

      <TextToolDialogs
        state={dialogState}
        onConfirm={(value) => {
          const replaceAll = dialogState?.kind === "editInCode";
          setDialogState(null);
          if (replaceAll) {
            onInsertValue(value, "replaceAll");
            return;
          }
          commitValue(value);
        }}
        onCancel={() => setDialogState(null)}
      />
    </>
  );
}
