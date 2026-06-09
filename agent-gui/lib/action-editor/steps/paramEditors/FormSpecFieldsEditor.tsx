"use client";

import { useCallback, useMemo, useState, type JSX } from "react";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import {
  FORM_FIELD_TYPES,
  formFieldTypeLabel,
  type FormFieldType,
  type FormSpecDocument,
  type FormSpecField,
} from "./formSpecModel";
import {
  buildFormFieldKeyCandidates,
  collectUsedFormFieldKeys,
  patchFormFieldKeyChange,
} from "./formSpecFieldKeyHelpers";
import { StepVariablePicker } from "./StepVariablePicker";

type FormSpecFieldsEditorProps = {
  spec: FormSpecDocument;
  onChange: (next: FormSpecDocument) => void;
  variables?: ActionVariable[];
};

function nextFieldKey(fields: FormSpecField[]): string {
  const used = new Set(fields.map((field) => field.key.toLowerCase()));
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `field${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `field${Date.now()}`;
}

function countAdvancedOptions(field: FormSpecField): number {
  let count = 0;
  if ((field.group ?? "").trim()) count += 1;
  if ((field.help ?? "").trim()) count += 1;
  if (field.default !== undefined && String(field.default).trim()) count += 1;
  if (field.min != null) count += 1;
  if (field.max != null) count += 1;
  if ((field.pattern ?? "").trim()) count += 1;
  if (field.visibleWhen?.field?.trim()) count += 1;
  if ((field.options ?? []).length > 0) count += 1;
  return count;
}

type FormSpecFieldCardProps = {
  index: number;
  field: FormSpecField;
  allFields: FormSpecField[];
  variables: ActionVariable[];
  canRemove: boolean;
  onChange: (patch: Partial<FormSpecField>) => void;
  onRemove: () => void;
};

function FormSpecFieldCard({
  index,
  field,
  allFields,
  variables,
  canRemove,
  onChange,
  onRemove,
}: FormSpecFieldCardProps): JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedCount = countAdvancedOptions(field);
  const advancedSummary =
    advancedCount > 0 ? `已配置 ${advancedCount} 项` : "分组、帮助、默认值、可见条件等";
  const keyCandidates = useMemo(
    () =>
      buildFormFieldKeyCandidates(
        variables,
        field.type,
        collectUsedFormFieldKeys(allFields, index),
      ),
    [variables, field.type, allFields, index],
  );

  const handleKeyChange = (nextKey: string): void => {
    onChange(patchFormFieldKeyChange(field, nextKey, variables));
  };

  return (
    <div className="form-spec-field-card">
      <div className="form-spec-field-card-head">
        <span className="form-spec-field-index">#{index + 1}</span>
        <span className="form-spec-field-card-title">
          {(field.label ?? "").trim() || field.key || `字段 ${index + 1}`}
        </span>
        <button
          type="button"
          className="form-spec-field-remove"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label="删除字段"
          title="删除字段"
        >
          ×
        </button>
      </div>

      <div className="form-spec-field-primary">
        <label className="form-spec-mini-field form-spec-mini-field--key">
          <span className="form-spec-meta-label">键名</span>
          {variables.length > 0 ? (
            <div className="form-spec-field-key-picker">
              <StepVariablePicker
                candidates={keyCandidates}
                resolveVariables={variables}
                selectedVarKey={field.key}
                onChange={handleKeyChange}
                title="选择动作变量作为字段键名"
              />
            </div>
          ) : (
            <input
              className="step-param-control"
              value={field.key}
              onChange={(event) => handleKeyChange(event.target.value)}
              placeholder="key"
              spellCheck={false}
            />
          )}
        </label>
        <label className="form-spec-mini-field">
          <span className="form-spec-meta-label">标签</span>
          <input
            className="step-param-control"
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="显示标题"
          />
        </label>
        <label className="form-spec-mini-field form-spec-mini-field--type">
          <span className="form-spec-meta-label">类型</span>
          <select
            className="step-param-control"
            value={field.type}
            onChange={(event) => onChange({ type: event.target.value as FormFieldType })}
          >
            {FORM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {formFieldTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-spec-field-secondary">
        <label className="form-spec-inline-check">
          <input
            type="checkbox"
            checked={field.required === true}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          <span>必填</span>
        </label>
        <label className="form-spec-mini-field form-spec-mini-field--target">
          <span className="form-spec-meta-label">写入变量</span>
          <input
            className="step-param-control"
            value={field.target ?? field.key}
            onChange={(event) => onChange({ target: event.target.value })}
            placeholder={field.key}
            spellCheck={false}
          />
        </label>
      </div>

      <button
        type="button"
        className={`form-spec-field-advanced-toggle${advancedOpen ? " open" : ""}`}
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        <span className="form-spec-field-advanced-toggle-label">更多设置</span>
        <span className="form-spec-field-advanced-toggle-meta">{advancedSummary}</span>
        <span className="form-spec-field-advanced-toggle-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {advancedOpen ? (
        <div className="form-spec-field-advanced">
          <label className="form-spec-mini-field">
            <span className="form-spec-meta-label">分组</span>
            <input
              className="step-param-control"
              value={field.group ?? ""}
              onChange={(event) => onChange({ group: event.target.value })}
              placeholder="可选"
            />
          </label>
          <label className="form-spec-mini-field">
            <span className="form-spec-meta-label">默认值</span>
            <input
              className="step-param-control"
              value={field.default === undefined ? "" : String(field.default)}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw.trim()) {
                  onChange({ default: undefined });
                  return;
                }
                if (field.type === "boolean") {
                  onChange({ default: raw === "true" });
                  return;
                }
                if (field.type === "number" || field.type === "integer") {
                  const num = Number(raw);
                  onChange({ default: Number.isFinite(num) ? num : raw });
                  return;
                }
                onChange({ default: raw });
              }}
              placeholder="可选"
              spellCheck={false}
            />
          </label>
          <label className="form-spec-mini-field form-spec-mini-field--span2">
            <span className="form-spec-meta-label">帮助说明</span>
            <input
              className="step-param-control"
              value={field.help ?? ""}
              onChange={(event) => onChange({ help: event.target.value })}
              placeholder="字段下方提示"
            />
          </label>
          {field.type === "number" || field.type === "integer" ? (
            <>
              <label className="form-spec-mini-field">
                <span className="form-spec-meta-label">最小值</span>
                <input
                  className="step-param-control"
                  type="number"
                  value={field.min ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    onChange({ min: raw.length > 0 ? Number.parseFloat(raw) : undefined });
                  }}
                />
              </label>
              <label className="form-spec-mini-field">
                <span className="form-spec-meta-label">最大值</span>
                <input
                  className="step-param-control"
                  type="number"
                  value={field.max ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    onChange({ max: raw.length > 0 ? Number.parseFloat(raw) : undefined });
                  }}
                />
              </label>
            </>
          ) : null}
          {field.type === "text" || field.type === "password" ? (
            <label className="form-spec-mini-field form-spec-mini-field--span2">
              <span className="form-spec-meta-label">校验正则</span>
              <input
                className="step-param-control"
                value={field.pattern ?? ""}
                onChange={(event) => onChange({ pattern: event.target.value })}
                placeholder="可选 pattern"
                spellCheck={false}
              />
            </label>
          ) : null}
          <div className="form-spec-visible-when form-spec-mini-field--span2">
            <span className="form-spec-meta-label">可见条件</span>
            <div className="form-spec-visible-when-row">
              <input
                className="step-param-control"
                value={field.visibleWhen?.field ?? ""}
                onChange={(event) => {
                  const refField = event.target.value.trim();
                  const prev = field.visibleWhen;
                  if (!refField) {
                    onChange({ visibleWhen: undefined });
                    return;
                  }
                  onChange({
                    visibleWhen: {
                      field: refField,
                      eq: prev?.eq,
                      ne: prev?.ne,
                    },
                  });
                }}
                placeholder="依赖字段 key"
                spellCheck={false}
              />
              <select
                className="step-param-control"
                value={field.visibleWhen?.eq != null ? "eq" : field.visibleWhen?.ne != null ? "ne" : "eq"}
                onChange={(event) => {
                  const refField = (field.visibleWhen?.field ?? "").trim();
                  if (!refField) return;
                  const mode = event.target.value;
                  const value = field.visibleWhen?.eq ?? field.visibleWhen?.ne ?? "";
                  onChange({
                    visibleWhen:
                      mode === "ne" ? { field: refField, ne: value } : { field: refField, eq: value },
                  });
                }}
              >
                <option value="eq">等于</option>
                <option value="ne">不等于</option>
              </select>
              <input
                className="step-param-control"
                value={field.visibleWhen?.eq ?? field.visibleWhen?.ne ?? ""}
                onChange={(event) => {
                  const refField = (field.visibleWhen?.field ?? "").trim();
                  if (!refField) return;
                  const value = event.target.value;
                  if (field.visibleWhen?.ne != null) {
                    onChange({ visibleWhen: { field: refField, ne: value } });
                  } else {
                    onChange({ visibleWhen: { field: refField, eq: value } });
                  }
                }}
                placeholder="比较值"
                spellCheck={false}
              />
            </div>
          </div>
          {field.type === "select" ? (
            <label className="form-spec-mini-field form-spec-mini-field--span2">
              <span className="form-spec-meta-label">下拉选项</span>
              <textarea
                className="step-param-control step-param-control--multiline"
                rows={3}
                value={(field.options ?? [])
                  .map((option) =>
                    option.label?.trim() ? `${option.value}|${option.label}` : option.value,
                  )
                  .join("\n")}
                onChange={(event) => {
                  const options = event.target.value
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const pipe = line.indexOf("|");
                      if (pipe >= 0) {
                        return {
                          value: line.slice(0, pipe).trim(),
                          label: line.slice(pipe + 1).trim(),
                        };
                      }
                      return { value: line };
                    })
                    .filter((option) => option.value.length > 0);
                  onChange({ options });
                }}
                placeholder="每行一项：value 或 value|显示名"
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FormSpecFieldsEditor({
  spec,
  onChange,
  variables = [],
}: FormSpecFieldsEditorProps): JSX.Element {
  const updateField = useCallback(
    (index: number, patch: Partial<FormSpecField>) => {
      onChange({
        ...spec,
        fields: spec.fields.map((field, idx) => (idx === index ? { ...field, ...patch } : field)),
      });
    },
    [onChange, spec],
  );

  const removeField = useCallback(
    (index: number) => {
      if (spec.fields.length <= 1) return;
      onChange({
        ...spec,
        fields: spec.fields.filter((_, idx) => idx !== index),
      });
    },
    [onChange, spec],
  );

  const addField = useCallback(() => {
    const key = nextFieldKey(spec.fields);
    onChange({
      ...spec,
      fields: [
        ...spec.fields,
        {
          key,
          label: `字段 ${spec.fields.length + 1}`,
          type: "text",
          target: key,
        },
      ],
    });
  }, [onChange, spec]);

  return (
    <div className="form-spec-fields-editor">
      <section className="form-spec-section">
        <h3 className="form-spec-section-title">表单信息</h3>
        <label className="form-spec-meta-field">
          <span className="form-spec-meta-label">窗口标题</span>
          <input
            className="step-param-control"
            value={spec.title ?? ""}
            onChange={(event) => onChange({ ...spec, title: event.target.value })}
            placeholder="运行表单时显示的标题"
          />
        </label>
      </section>

      <section className="form-spec-section form-spec-section--fields">
        <div className="form-spec-section-head">
          <h3 className="form-spec-section-title">字段列表</h3>
          <span className="form-spec-section-meta">{spec.fields.length} 项</span>
        </div>

        <div className="form-spec-fields-list">
          {spec.fields.map((field, index) => (
            <FormSpecFieldCard
              key={`${field.key}-${index}`}
              index={index}
              field={field}
              allFields={spec.fields}
              variables={variables}
              canRemove={spec.fields.length > 1}
              onChange={(patch) => updateField(index, patch)}
              onRemove={() => removeField(index)}
            />
          ))}
        </div>

        <button type="button" className="form-spec-add-field" onClick={addField}>
          + 添加字段
        </button>
      </section>
    </div>
  );
}
