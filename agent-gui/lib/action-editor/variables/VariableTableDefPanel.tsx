import { useCallback, type JSX } from "react";
import {
  ActionTableField,
  ActionVariable,
  type ActionTableDef,
} from "@/lib/action-editor/types/common";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import { actionVarTypeZhLabel } from "./actionVariableUi";

const TABLE_COLUMN_TYPE_OPTIONS = [
  CsVarType.Text,
  CsVarType.Number,
  CsVarType.Boolean,
  CsVarType.DateTime,
] as const;

function ensureTableDef(variable: ActionVariable): ActionTableDef {
  return {
    fields: variable.tableDef?.fields?.map((f) => ActionTableField.fromPartial(f)) ?? [],
  };
}

function nextFieldKey(fields: ActionTableField[]): string {
  const used = new Set(fields.map((f) => (f.fieldKey ?? "").trim().toLowerCase()));
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `col${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `col${Date.now()}`;
}

function createEmptyTableField(): ActionTableField {
  return ActionTableField.fromPartial({
    fieldKey: "",
    label: "",
    quickerVarType: CsVarType.Text,
    showInList: true,
  });
}

type VariableTableDefPanelProps = {
  variable: ActionVariable;
  onPatch: (next: ActionVariable) => void;
};

export function VariableTableDefPanel({
  variable,
  onPatch,
}: VariableTableDefPanelProps): JSX.Element | null {
  if ((variable.varType ?? 0) !== CsVarType.Table) {
    return null;
  }

  const tableDef = ensureTableDef(variable);

  const commitFields = useCallback(
    (fields: ActionTableField[]) => {
      const cleaned = fields
        .map((f) => ActionTableField.fromPartial(f))
        .filter((f) => (f.fieldKey ?? "").trim().length > 0);
      onPatch(
        ActionVariable.fromPartial({
          ...variable,
          tableDef: cleaned.length > 0 ? { fields: cleaned } : undefined,
        }),
      );
    },
    [onPatch, variable],
  );

  const updateField = (index: number, patch: Partial<ActionTableField>): void => {
    const fields = tableDef.fields.map((field, idx) =>
      idx === index ? ActionTableField.fromPartial({ ...field, ...patch }) : field,
    );
    commitFields(fields);
  };

  const removeField = (index: number): void => {
    commitFields(tableDef.fields.filter((_, idx) => idx !== index));
  };

  const addField = (): void => {
    const key = nextFieldKey(tableDef.fields);
    commitFields([
      ...tableDef.fields,
      ActionTableField.fromPartial({
        ...createEmptyTableField(),
        fieldKey: key,
        label: key,
      }),
    ]);
  };

  return (
    <div className="variable-form-section" role="group" aria-labelledby="variable-form-table-title">
      <div id="variable-form-table-title" className="variable-form-section-title">
        表格列定义
      </div>
      {tableDef.fields.length === 0 ? (
        <p className="variable-form-help">尚未定义列。保存后 Quicker 将使用空表结构。</p>
      ) : null}
      <div className="variable-table-def-list">
        {tableDef.fields.map((field, index) => (
          <div key={`${field.fieldKey}-${index}`} className="variable-table-def-row">
            <input
              className="step-param-control"
              value={field.fieldKey}
              placeholder="列键"
              spellCheck={false}
              onChange={(event) => updateField(index, { fieldKey: event.target.value })}
            />
            <input
              className="step-param-control"
              value={field.label}
              placeholder="列标题"
              onChange={(event) => updateField(index, { label: event.target.value })}
            />
            <select
              className="step-param-control"
              value={field.quickerVarType ?? CsVarType.Text}
              onChange={(event) =>
                updateField(index, { quickerVarType: Number.parseInt(event.target.value, 10) })
              }
            >
              {TABLE_COLUMN_TYPE_OPTIONS.map((vt) => (
                <option key={vt} value={vt}>
                  {actionVarTypeZhLabel(vt)}
                </option>
              ))}
            </select>
            <label className="variable-form-check variable-table-def-flag" title="在列表中显示">
              <input
                type="checkbox"
                checked={field.showInList !== false}
                onChange={(event) => updateField(index, { showInList: event.target.checked })}
              />
              <span>列表</span>
            </label>
            <button
              type="button"
              className="form-spec-field-remove"
              onClick={() => removeField(index)}
              aria-label="删除列"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="form-spec-add-field" onClick={addField}>
        + 添加列
      </button>
    </div>
  );
}
