"use client";

import { useCallback, type JSX } from "react";
import {
  FORM_FIELD_TYPES,
  type FormFieldType,
  type FormSpecDocument,
  type FormSpecField,
} from "./formSpecModel";

type FormSpecFieldsEditorProps = {
  spec: FormSpecDocument;
  onChange: (next: FormSpecDocument) => void;
};

function nextFieldKey(fields: FormSpecField[]): string {
  const used = new Set(fields.map((field) => field.key.toLowerCase()));
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `field${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `field${Date.now()}`;
}

export function FormSpecFieldsEditor({
  spec,
  onChange,
}: FormSpecFieldsEditorProps): JSX.Element {
  const updateField = useCallback(
    (index: number, patch: Partial<FormSpecField>) => {
      onChange({
        ...spec,
        fields: spec.fields.map((field, idx) =>
          idx === index ? { ...field, ...patch } : field,
        ),
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
      <label className="form-spec-meta-field">
        <span className="form-spec-meta-label">表单标题</span>
        <input
          className="step-param-control"
          value={spec.title ?? ""}
          onChange={(event) => onChange({ ...spec, title: event.target.value })}
          placeholder="窗口标题"
        />
      </label>

      <div className="form-spec-fields-head" aria-hidden>
        <span>键名</span>
        <span>标签</span>
        <span>类型</span>
        <span />
      </div>

      <div className="form-spec-fields-list">
        {spec.fields.map((field, index) => (
          <div key={`${field.key}-${index}`} className="form-spec-field-card">
            <div className="form-spec-field-row">
              <input
                className="step-param-control"
                value={field.key}
                onChange={(event) => updateField(index, { key: event.target.value })}
                placeholder="key"
                spellCheck={false}
              />
              <input
                className="step-param-control"
                value={field.label}
                onChange={(event) => updateField(index, { label: event.target.value })}
                placeholder="标签"
              />
              <select
                className="step-param-control"
                value={field.type}
                onChange={(event) =>
                  updateField(index, { type: event.target.value as FormFieldType })
                }
              >
                {FORM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="form-spec-field-remove"
                disabled={spec.fields.length <= 1}
                onClick={() => removeField(index)}
                aria-label="删除字段"
                title="删除字段"
              >
                ×
              </button>
            </div>

            <div className="form-spec-field-advanced">
              <label className="form-spec-inline-check">
                <input
                  type="checkbox"
                  checked={field.required === true}
                  onChange={(event) => updateField(index, { required: event.target.checked })}
                />
                <span>必填</span>
              </label>
              <label className="form-spec-meta-field form-spec-meta-field--compact">
                <span className="form-spec-meta-label">写入变量</span>
                <input
                  className="step-param-control"
                  value={field.target ?? field.key}
                  onChange={(event) => updateField(index, { target: event.target.value })}
                  placeholder={field.key}
                  spellCheck={false}
                />
              </label>
              <label className="form-spec-meta-field form-spec-meta-field--compact">
                <span className="form-spec-meta-label">分组</span>
                <input
                  className="step-param-control"
                  value={field.group ?? ""}
                  onChange={(event) => updateField(index, { group: event.target.value })}
                  placeholder="可选"
                />
              </label>
              <label className="form-spec-meta-field form-spec-meta-field--wide">
                <span className="form-spec-meta-label">帮助说明</span>
                <input
                  className="step-param-control"
                  value={field.help ?? ""}
                  onChange={(event) => updateField(index, { help: event.target.value })}
                  placeholder="字段下方提示"
                />
              </label>
              <label className="form-spec-meta-field form-spec-meta-field--compact">
                <span className="form-spec-meta-label">默认值</span>
                <input
                  className="step-param-control"
                  value={field.default === undefined ? "" : String(field.default)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (!raw.trim()) {
                      updateField(index, { default: undefined });
                      return;
                    }
                    if (field.type === "boolean") {
                      updateField(index, { default: raw === "true" });
                      return;
                    }
                    if (field.type === "number" || field.type === "integer") {
                      const num = Number(raw);
                      updateField(index, { default: Number.isFinite(num) ? num : raw });
                      return;
                    }
                    updateField(index, { default: raw });
                  }}
                  placeholder="可选"
                  spellCheck={false}
                />
              </label>
              {field.type === "number" || field.type === "integer" ? (
                <>
                  <label className="form-spec-meta-field form-spec-meta-field--compact">
                    <span className="form-spec-meta-label">最小值</span>
                    <input
                      className="step-param-control"
                      type="number"
                      value={field.min ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        updateField(index, {
                          min: raw.length > 0 ? Number.parseFloat(raw) : undefined,
                        });
                      }}
                    />
                  </label>
                  <label className="form-spec-meta-field form-spec-meta-field--compact">
                    <span className="form-spec-meta-label">最大值</span>
                    <input
                      className="step-param-control"
                      type="number"
                      value={field.max ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        updateField(index, {
                          max: raw.length > 0 ? Number.parseFloat(raw) : undefined,
                        });
                      }}
                    />
                  </label>
                </>
              ) : null}
              {field.type === "text" || field.type === "password" ? (
                <label className="form-spec-meta-field form-spec-meta-field--wide">
                  <span className="form-spec-meta-label">校验正则 pattern</span>
                  <input
                    className="step-param-control"
                    value={field.pattern ?? ""}
                    onChange={(event) => updateField(index, { pattern: event.target.value })}
                    spellCheck={false}
                  />
                </label>
              ) : null}
              <div className="form-spec-visible-when">
                <span className="form-spec-meta-label">可见条件 visibleWhen</span>
                <div className="form-spec-visible-when-row">
                  <input
                    className="step-param-control"
                    value={field.visibleWhen?.field ?? ""}
                    onChange={(event) => {
                      const refField = event.target.value.trim();
                      const prev = field.visibleWhen;
                      if (!refField) {
                        updateField(index, { visibleWhen: undefined });
                        return;
                      }
                      updateField(index, {
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
                      updateField(index, {
                        visibleWhen:
                          mode === "ne"
                            ? { field: refField, ne: value }
                            : { field: refField, eq: value },
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
                        updateField(index, { visibleWhen: { field: refField, ne: value } });
                      } else {
                        updateField(index, { visibleWhen: { field: refField, eq: value } });
                      }
                    }}
                    placeholder="比较值"
                    spellCheck={false}
                  />
                </div>
              </div>
              {field.type === "select" ? (
                <label className="form-spec-meta-field form-spec-meta-field--wide">
                  <span className="form-spec-meta-label">选项（每行 value 或 value|label）</span>
                  <textarea
                    className="step-param-control step-param-control--multiline"
                    rows={3}
                    value={(field.options ?? [])
                      .map((option) =>
                        option.label?.trim()
                          ? `${option.value}|${option.label}`
                          : option.value,
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
                      updateField(index, { options });
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="form-spec-add-field" onClick={addField}>
        + 添加字段
      </button>
    </div>
  );
}
