import type { StepRunnerParamSelectionItem } from "@/lib/action-editor/types/action_query";

/** Single-line enum label for the closed VarOrValue field (name preferred). */
export function formatEnumSelectionDisplayText(item: StepRunnerParamSelectionItem): string {
  const title = (item.name ?? "").trim();
  const value = (item.value ?? "").trim();
  return title.length > 0 ? title : value;
}

/** Mirrors VariableOrValueSelectItem: title plus muted key when different. */
export function SelectionItemLabel({
  item,
  compact = false,
}: {
  item: StepRunnerParamSelectionItem;
  /** Closed field / single-line display: show one label only. */
  compact?: boolean;
}): JSX.Element {
  const title = (item.name ?? "").trim() || item.value;
  const key = (item.value ?? "").trim();
  if (compact) {
    return <span className="step-param-varorvalue-title">{formatEnumSelectionDisplayText(item)}</span>;
  }
  const showKey = key.length > 0 && key !== title;
  return (
    <>
      <span className="step-param-varorvalue-title">{title}</span>
      {showKey ? <span className="step-param-varorvalue-muted">{key}</span> : null}
    </>
  );
}
