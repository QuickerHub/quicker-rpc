import { useId, type JSX, type ReactNode, type RefObject } from "react";
import type { StepRunnerInputParamDef } from "../../types/action_query";
import { nextLargeParamTab } from "./stepLargeParamLayout";

/** Stable panels retain each existing editor/file owner while its tab is hidden. */
export function StepEditorLargeParamTabs({ fields, activeKey, onSelect, tabListRef, configPanel, renderEditor }: {
  fields: readonly StepRunnerInputParamDef[];
  activeKey: string | null;
  onSelect(key: string | null): void;
  tabListRef: RefObject<HTMLDivElement | null>;
  configPanel: ReactNode;
  renderEditor(field: StepRunnerInputParamDef): ReactNode;
}): JSX.Element {
  const id = useId();
  const tabs = [{ key: null as string | null, title: "参数" },
    ...fields.map(field => ({ key: field.key, title: field.name.trim() || field.key }))];
  return <div className="step-editor-large-tabs">
    <div ref={tabListRef} className="step-editor-large-tabs__bar" role="tablist" aria-label="步骤参数分区"
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
        const next = nextLargeParamTab(activeKey, fields.map(field => field.key), event.key);
        if (next === undefined) return;
        event.preventDefault(); event.stopPropagation(); onSelect(next);
        const index = tabs.findIndex(tab => tab.key === next);
        tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
      }}>
      {tabs.map((tab, index) => <button key={index === 0 ? "config" : `input:${tab.key}`} type="button"
        id={`${id}-tab-${index}`} role="tab" aria-selected={activeKey === tab.key}
        aria-controls={`${id}-panel-${index}`} tabIndex={activeKey === tab.key ? 0 : -1}
        data-large-param-tab={tab.key ?? ""} className="step-editor-large-tabs__tab"
        title={tab.title} onClick={() => onSelect(tab.key)}>{tab.title}</button>)}
    </div>
    <div id={`${id}-panel-0`} role="tabpanel" aria-labelledby={`${id}-tab-0`}
      hidden={activeKey !== null} inert={activeKey !== null} className="step-editor-large-tabs__panel">{configPanel}</div>
    {fields.map((field, index) => <div key={field.key} id={`${id}-panel-${index + 1}`} role="tabpanel"
      aria-labelledby={`${id}-tab-${index + 1}`} hidden={activeKey !== field.key} inert={activeKey !== field.key}
      className="step-editor-large-tabs__panel step-editor-large-tabs__editor" data-large-param-key={field.key}>
      {renderEditor(field)}
    </div>)}
  </div>;
}
