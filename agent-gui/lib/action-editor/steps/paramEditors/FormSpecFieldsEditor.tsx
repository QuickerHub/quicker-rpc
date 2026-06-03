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
