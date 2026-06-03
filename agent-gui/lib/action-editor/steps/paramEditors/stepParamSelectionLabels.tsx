import type { StepRunnerParamSelectionItem } from "@/lib/action-editor/types/action_query";

/** Mirrors VariableOrValueSelectItem: title plus muted key when different. */
export function SelectionItemLabel({ item }: { item: StepRunnerParamSelectionItem }): JSX.Element {
  const title = (item.name ?? "").trim() || item.value;
  const key = (item.value ?? "").trim();
  const showKey = key.length > 0 && key !== title;
  return (
    <>
      <span className="step-param-varorvalue-title">{title}</span>
      {showKey ? <span className="step-param-varorvalue-muted">{key}</span> : null}
    </>
  );
}
