import { useMemo } from "react";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import {
  parseTextToolsValue,
  serializeTextToolsValue,
  TEXT_TOOL_CATALOG,
} from "./textToolCatalog";

export type TextToolsParamEditorProps = {
  param: ActionStepParam;
  onChange: (next: ActionStepParam) => void;
  description?: string;
};

export function TextToolsParamEditor({
  param,
  onChange,
  description,
}: TextToolsParamEditorProps): JSX.Element {
  const selected = useMemo(() => new Set(parseTextToolsValue(param.value ?? "")), [param.value]);

  const toggle = (toolValue: string): void => {
    const next = new Set(selected);
    if (next.has(toolValue)) {
      next.delete(toolValue);
    } else {
      next.add(toolValue);
    }
    const ordered = TEXT_TOOL_CATALOG.map((item) => item.value).filter((v) => next.has(v));
    onChange({ ...param, varKey: "", value: serializeTextToolsValue(ordered) });
  };

  return (
    <div className="step-param-texttools" title={description}>
      <div className="step-param-texttools-grid" role="group" aria-label="文本选择工具">
        {TEXT_TOOL_CATALOG.map((item) => {
          const checked = selected.has(item.value);
          const inputId = `texttool-${item.value}`;
          return (
            <label key={item.value} htmlFor={inputId} className="step-param-texttools-item">
              <input
                id={inputId}
                type="checkbox"
                className="step-param-checkbox"
                checked={checked}
                onChange={() => toggle(item.value)}
              />
              <span>{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
