"use client";

import { useCallback, useRef, useState, type ChangeEvent, type JSX } from "react";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import { TEXT_TOOL_CATALOG } from "./textToolCatalog";
import { parseParamTextToolIds } from "./stepRunnerInputParamUi";
import { TextToolDialogs, type TextToolDialogState } from "./TextToolDialogs";
import {
  isWebTextTool,
  resolveTextToolDialogKind,
  runNativeFileTextTool,
} from "./textToolWebSupport";

export type ParamTextToolsStripProps = {
  textTools: string;
  /** Insert or replace value in the bound field (desktop TextToolsControl). */
  onInsertValue: (value: string, mode: "replace" | "append") => void;
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
      variables: kind === "boolExpression" ? variables : undefined,
    });
  }, [variables]);

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

      window.alert(`「${resolveToolLabel(toolId)}」需在 Quicker 桌面版步骤编辑器中使用。`);
    },
    [commitValue, disabled, openBrowserPicker, openDialogForTool],
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
          return (
            <button
              key={toolId}
              type="button"
              className={`step-param-texttools-btn${webCapable ? " step-param-texttools-btn--web" : ""}`}
              title={
                webCapable
                  ? resolveToolLabel(toolId)
                  : `${resolveToolLabel(toolId)}（仅桌面版）`
              }
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
          setDialogState(null);
          commitValue(value);
        }}
        onCancel={() => setDialogState(null)}
      />
    </>
  );
}
