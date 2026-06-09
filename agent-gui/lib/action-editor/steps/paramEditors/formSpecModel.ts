import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import { CsVarType } from "./csStepEnums";

export const FORM_SPEC_SCHEMA = "qkrpc.form.v1";

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "integer",
  "boolean",
  "select",
  "dateTime",
  "password",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type FormSpecFieldOption = {
  value: string;
  label?: string;
};

export type FormSpecVisibleWhen = {
  field: string;
  eq?: string;
  ne?: string;
};

export type FormSpecField = {
  key: string;
  label: string;
  type: FormFieldType;
  target?: string;
  required?: boolean;
  default?: string | boolean | number;
  help?: string;
  group?: string;
  pattern?: string;
  options?: FormSpecFieldOption[];
  min?: number;
  max?: number;
  visibleWhen?: FormSpecVisibleWhen;
};

export type FormSpecDocument = {
  $schema?: string;
  mode?: string;
  title?: string;
  dictVar?: string;
  fields: FormSpecField[];
  options?: Record<string, unknown>;
};

export type FormSpecParseResult =
  | { ok: true; spec: FormSpecDocument; format: "v1" | "native" }
  | { ok: false; error: string };

export function isFormParamDef(def: StepRunnerInputParamDef): boolean {
  const vt = def.varType;
  return vt === CsVarType.Form || vt === CsVarType.FormForDict;
}

export function createEmptyFormSpec(forDict = false): FormSpecDocument {
  return {
    $schema: FORM_SPEC_SCHEMA,
    mode: forDict ? "dict_dynamic" : "variables",
    title: "",
    fields: [
      {
        key: "field1",
        label: "字段 1",
        type: "text",
        target: "field1",
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFieldType(raw: unknown): FormFieldType {
  const text = typeof raw === "string" ? raw.trim() : "";
  if ((FORM_FIELD_TYPES as readonly string[]).includes(text)) {
    return text as FormFieldType;
  }
  return "text";
}

function parseV1Field(raw: unknown): FormSpecField | null {
  if (!isRecord(raw)) return null;
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!key || !label) return null;
  const field: FormSpecField = {
    key,
    label,
    type: normalizeFieldType(raw.type),
    target: typeof raw.target === "string" ? raw.target.trim() : key,
  };
  if (raw.required === true) field.required = true;
  if (typeof raw.help === "string" && raw.help.trim()) field.help = raw.help.trim();
  if (typeof raw.group === "string" && raw.group.trim()) field.group = raw.group.trim();
  if (typeof raw.pattern === "string" && raw.pattern.trim()) field.pattern = raw.pattern.trim();
  if (typeof raw.default === "string" || typeof raw.default === "number" || typeof raw.default === "boolean") {
    field.default = raw.default;
  }
  if (typeof raw.min === "number") field.min = raw.min;
  if (typeof raw.max === "number") field.max = raw.max;
  if (isRecord(raw.visibleWhen)) {
    const refField =
      typeof raw.visibleWhen.field === "string" ? raw.visibleWhen.field.trim() : "";
    if (refField) {
      const visibleWhen: FormSpecVisibleWhen = { field: refField };
      if (typeof raw.visibleWhen.eq === "string" && raw.visibleWhen.eq.trim()) {
        visibleWhen.eq = raw.visibleWhen.eq.trim();
      } else if (typeof raw.visibleWhen.ne === "string" && raw.visibleWhen.ne.trim()) {
        visibleWhen.ne = raw.visibleWhen.ne.trim();
      }
      if (visibleWhen.eq || visibleWhen.ne) {
        field.visibleWhen = visibleWhen;
      }
    }
  }
  if (Array.isArray(raw.options)) {
    const options = raw.options
      .map((entry): FormSpecFieldOption | null => {
        if (!isRecord(entry)) return null;
        const value = typeof entry.value === "string" ? entry.value.trim() : "";
        if (!value) return null;
        const option: FormSpecFieldOption = { value };
        const labelText =
          (typeof entry.label === "string" ? entry.label.trim() : "")
          || (typeof entry.name === "string" ? entry.name.trim() : "");
        if (labelText) option.label = labelText;
        return option;
      })
      .filter((entry): entry is FormSpecFieldOption => entry !== null);
    if (options.length > 0) field.options = options;
  }
  return field;
}

function looksLikeNativeForm(root: Record<string, unknown>): boolean {
  const fields = root.fields;
  if (!Array.isArray(fields) || fields.length === 0) return false;
  const first = fields[0];
  return isRecord(first) && typeof first.FieldKey === "string";
}

export function parseFormSpecText(text: string): FormSpecParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, spec: createEmptyFormSpec(), format: "v1" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "JSON 解析失败" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "表单定义须为 JSON 对象" };
  }
  if (looksLikeNativeForm(parsed)) {
    return {
      ok: true,
      spec: {
        $schema: FORM_SPEC_SCHEMA,
        mode: "variables",
        title: "",
        fields: [],
      },
      format: "native",
    };
  }
  const fieldsRaw = Array.isArray(parsed.fields) ? parsed.fields : [];
  const fields = fieldsRaw
    .map(parseV1Field)
    .filter((field): field is FormSpecField => field !== null);
  if (fields.length === 0 && fieldsRaw.length > 0) {
    return { ok: false, error: "fields 内缺少有效的 key / label" };
  }
  const spec: FormSpecDocument = {
    $schema: typeof parsed.$schema === "string" ? parsed.$schema : FORM_SPEC_SCHEMA,
    mode: typeof parsed.mode === "string" ? parsed.mode : "variables",
    title: typeof parsed.title === "string" ? parsed.title : "",
    fields: fields.length > 0 ? fields : createEmptyFormSpec().fields,
  };
  if (typeof parsed.dictVar === "string" && parsed.dictVar.trim()) {
    spec.dictVar = parsed.dictVar.trim();
  }
  if (isRecord(parsed.options)) {
    spec.options = parsed.options;
  }
  return { ok: true, spec, format: "v1" };
}

export function serializeFormSpec(spec: FormSpecDocument): string {
  const payload: FormSpecDocument = {
    $schema: FORM_SPEC_SCHEMA,
    mode: spec.mode?.trim() || "variables",
    title: spec.title ?? "",
    fields: spec.fields.map((field) => {
      const next: FormSpecField = {
        key: field.key.trim(),
        label: field.label.trim(),
        type: field.type,
        target: (field.target ?? field.key).trim() || field.key.trim(),
      };
      if (field.required) next.required = true;
      if (field.help?.trim()) next.help = field.help.trim();
      if (field.group?.trim()) next.group = field.group.trim();
      if (field.pattern?.trim()) next.pattern = field.pattern.trim();
      if (field.default !== undefined && field.default !== "") next.default = field.default;
      if (typeof field.min === "number") next.min = field.min;
      if (typeof field.max === "number") next.max = field.max;
      if (field.type === "select" && field.options?.length) {
        next.options = field.options
          .map((option) => ({
            value: option.value.trim(),
            ...(option.label?.trim() ? { label: option.label.trim() } : {}),
          }))
          .filter((option) => option.value.length > 0);
      }
      if (field.visibleWhen?.field?.trim()) {
        const visibleWhen: FormSpecVisibleWhen = { field: field.visibleWhen.field.trim() };
        if (field.visibleWhen.eq?.trim()) {
          visibleWhen.eq = field.visibleWhen.eq.trim();
        } else if (field.visibleWhen.ne?.trim()) {
          visibleWhen.ne = field.visibleWhen.ne.trim();
        }
        if (visibleWhen.eq || visibleWhen.ne) {
          next.visibleWhen = visibleWhen;
        }
      }
      return next;
    }),
  };
  if (spec.dictVar?.trim()) payload.dictVar = spec.dictVar.trim();
  if (spec.options && Object.keys(spec.options).length > 0) payload.options = spec.options;
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function summarizeFormSpec(spec: FormSpecDocument): {
  title: string;
  fieldCount: number;
} {
  return {
    title: (spec.title ?? "").trim() || "（无标题）",
    fieldCount: spec.fields?.length ?? 0,
  };
}

export function suggestFormSpecFileName(existingNames: readonly string[]): string {
  const used = new Set(existingNames.map((name) => name.toLowerCase()));
  for (let i = 1; i < 100; i += 1) {
    const candidate = `files/form${i}.form.json`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `files/form-${Date.now()}.form.json`;
}

export function projectRelativeFilePath(projectDir: string, file: string): string {
  const base = projectDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const rel = file.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${base}/${rel}`;
}

export function isFormSpecFilePath(path: string): boolean {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.toLowerCase().endsWith(".form.json");
}

export type FormSpecFilePrepareResult =
  | { ok: true; content: string; reformatted: boolean }
  | { ok: false; error: string };

/** Parse and canonicalize *.form.json before agent write/edit (2-space indent, label not name). */
export function prepareFormSpecFileContentForWrite(
  rawContent: string,
): FormSpecFilePrepareResult {
  const parsed = parseFormSpecText(rawContent);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `form.json 无效：${parsed.error}。请输出完整 qkrpc.form.v1 JSON（select.options 用 value+label，勿用 name）。`,
    };
  }
  if (parsed.format === "native") {
    return {
      ok: false,
      error:
        "form.json 为 Quicker 原生表单格式，Agent 请改用 qkrpc.form.v1（$schema、fields[].key/label/type）。",
    };
  }
  const content = serializeFormSpec(parsed.spec);
  const reformatted = content !== rawContent && content !== rawContent.replace(/\r\n/g, "\n");
  return { ok: true, content, reformatted };
}
