import { useCallback, useId, useRef, type ChangeEvent, type JSX } from "react";
import { TEXT_TOOL_CATALOG } from "./textToolCatalog";
import { parseParamTextToolIds } from "./stepRunnerInputParamUi";

export type ParamTextToolsStripProps = {
  textTools: string;
  /** Insert or replace value in the bound field (desktop TextToolsControl). */
  onInsertValue: (value: string, mode: "replace" | "append") => void;
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
  disabled = false,
}: ParamTextToolsStripProps): JSX.Element | null {
  const ids = parseParamTextToolIds(textTools);
  if (ids.length === 0) {
    return null;
  }

  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingToolRef = useRef<string | null>(null);

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
          onInsertValue(paths.join(";"), "replace");
        }
        return;
      }
      if (toolId === "SelectSingleFolder") {
        const first = files[0];
        if (first) {
          onInsertValue(first.webkitRelativePath.split("/")[0] ?? first.name, "replace");
        }
        return;
      }
      const first = files[0];
      if (first) {
        onInsertValue(first.name, "replace");
      }
    },
    [onInsertValue],
  );

  const handleToolClick = useCallback(
    (toolId: string): void => {
      if (disabled) {
        return;
      }
      if (BROWSER_FILE_TOOLS.has(toolId)) {
        openBrowserPicker(toolId);
        return;
      }
      // Desktop-only pickers; keep toolbar visible for parity with WPF VarAndValueParamEditor.
      window.alert(`「${resolveToolLabel(toolId)}」需在 Quicker 桌面版步骤编辑器中使用。`);
    },
    [disabled, openBrowserPicker],
  );

  return (
    <div className="step-param-texttools-strip" role="toolbar" aria-label="文本工具">
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        className="step-param-texttools-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />
      {ids.map((toolId) => {
        const browserCapable = BROWSER_FILE_TOOLS.has(toolId);
        return (
          <button
            key={toolId}
            type="button"
            className="step-param-texttools-btn"
            title={
              browserCapable
                ? resolveToolLabel(toolId)
                : `${resolveToolLabel(toolId)}（仅桌面版）`
            }
            disabled={disabled}
            onClick={() => handleToolClick(toolId)}
          >
            {resolveToolLabel(toolId)}
          </button>
        );
      })}
    </div>
  );
}
