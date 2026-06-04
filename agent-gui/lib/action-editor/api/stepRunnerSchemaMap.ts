import type { StepRunnerInputParamDef, StepRunnerOutputParamDef, StepRunnerSubItem } from "@/lib/action-editor/types/action_query";
import { CsVarType, ParamVariableMode } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import { inferStepParamMultiline } from "@/lib/action-editor/steps/paramEditors/stepParamMultiline";

function readString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function readStringArray(obj: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.filter((x): x is string => typeof x === "string");
    }
  }
  return [];
}

function readInt(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function readBool(obj: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return false;
}

/** Maps qkrpc agent schema valueType string to Quicker VarType int. */
export function parseAgentValueType(valueType: string): number {
  const t = valueType.trim();
  switch (t) {
    case "Text":
      return CsVarType.Text;
    case "Number":
      return CsVarType.Number;
    case "Boolean":
      return CsVarType.Boolean;
    case "Image":
      return CsVarType.Image;
    case "List":
      return CsVarType.List;
    case "DateTime":
      return CsVarType.DateTime;
    case "Keyboard":
      return CsVarType.Keyboard;
    case "Mouse":
      return CsVarType.Mouse;
    case "Enum":
      return CsVarType.Enum;
    case "Dict":
      return CsVarType.Dict;
    case "Form":
      return CsVarType.Form;
    case "Integer":
      return CsVarType.Integer;
    case "Table":
      return CsVarType.Table;
    case "FormForDict":
      return CsVarType.FormForDict;
    case "Object":
      return CsVarType.Object;
    case "Any":
      return CsVarType.Any;
    case "NA":
      return CsVarType.NA;
    case "CreateVar":
      return CsVarType.CreateVar;
    default: {
      const m = /^Unknown\((\d+)\)$/.exec(t);
      if (m) {
        const n = Number.parseInt(m[1]!, 10);
        if (Number.isFinite(n)) return n;
      }
      return CsVarType.Text;
    }
  }
}

function mapSelectionItems(raw: unknown): StepRunnerInputParamDef["selectionItems"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<StepRunnerInputParamDef["selectionItems"]> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const value = readString(o, "value", "Value", "key", "Key");
    if (!value) continue;
    out.push({
      value,
      name: readString(o, "name", "Name", "label", "Label", "title", "Title"),
      description: readString(o, "description", "Description", "hint", "Hint", "purpose", "Purpose"),
    });
  }
  return out;
}

function inferVariableModeFromAgentInput(
  key: string,
  varType: number,
  hasOptions: boolean,
  isControlField: boolean
): number {
  if (varType === CsVarType.Form || varType === CsVarType.FormForDict) {
    return ParamVariableMode.Input;
  }
  if (varType === CsVarType.Enum && (hasOptions || isControlField)) {
    return ParamVariableMode.Input;
  }
  if (varType === CsVarType.Boolean) {
    const k = key.trim().toLowerCase();
    if (k === "condition") {
      return ParamVariableMode.UseVarOrInput;
    }
    if (/^(stop|skip|enable|use|wait|restore|disable|allow|show|hide)/.test(k) || k.endsWith("switch")) {
      return ParamVariableMode.Input;
    }
    return ParamVariableMode.Input;
  }
  return ParamVariableMode.UseVarOrInput;
}

type ControlFieldSelectionHint = {
  value: string;
  name: string;
  description: string;
  visibleInputKeys?: string[];
  visibleOutputKeys?: string[];
};

type ControlFieldHint = {
  key: string;
  selectionItems: ControlFieldSelectionHint[];
};

function mapControlFieldSelectionItems(raw: unknown): ControlFieldSelectionHint[] {
  if (!Array.isArray(raw)) return [];
  const out: ControlFieldSelectionHint[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const value = readString(o, "value", "Value", "key", "Key");
    if (!value) continue;
    const visibleInputKeys = readStringArray(
      o,
      "visibleInputKeys",
      "VisibleInputKeys",
    );
    const visibleOutputKeys = readStringArray(
      o,
      "visibleOutputKeys",
      "VisibleOutputKeys",
    );
    out.push({
      value,
      name: readString(o, "name", "Name", "label", "Label", "title", "Title") ?? "",
      description: readString(
        o,
        "description",
        "Description",
        "hint",
        "Hint",
        "purpose",
        "Purpose",
      ) ?? "",
      visibleInputKeys:
        visibleInputKeys.length > 0 ? visibleInputKeys : undefined,
      visibleOutputKeys:
        visibleOutputKeys.length > 0 ? visibleOutputKeys : undefined,
    });
  }
  return out;
}

function readControlFieldHint(schema: Record<string, unknown>): ControlFieldHint | null {
  const raw = schema.controlField ?? schema.ControlField;
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const key = readString(o, "key", "Key");
  if (!key) return null;
  const selectionItems = mapControlFieldSelectionItems(o.selection ?? o.Selection);
  return { key, selectionItems };
}

function applyValidForFromControlVisibleKeys(
  controlField: ControlFieldHint,
  paramKeysByMode: (sel: ControlFieldSelectionHint) => string[] | undefined,
  defs: Array<
    Pick<
      StepRunnerInputParamDef | StepRunnerOutputParamDef,
      "key" | "validForList" | "invalidForList" | "visibleExpression"
    >
  >,
): void {
  const byParam = new Map<string, string[]>();
  for (const sel of controlField.selectionItems) {
    const mode = sel.value.trim();
    if (!mode) continue;
    for (const paramKey of paramKeysByMode(sel) ?? []) {
      const k = paramKey.trim();
      if (!k || k === controlField.key) continue;
      const modes = byParam.get(k) ?? [];
      if (!modes.some((m) => m.toLowerCase() === mode.toLowerCase())) {
        modes.push(mode);
      }
      byParam.set(k, modes);
    }
  }

  for (const def of defs) {
    const modes = byParam.get(def.key);
    if (!modes?.length) continue;
    def.validForList = modes;
    def.invalidForList = [];
    def.visibleExpression = "";
  }
}

function mapAgentInputParamDef(
  raw: unknown,
  controlField: ControlFieldHint | null
): StepRunnerInputParamDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const key = readString(o, "key", "Key");
  if (!key) return null;

  const valueType = readString(o, "valueType", "ValueType");
  const varType = parseAgentValueType(valueType);
  const options = mapSelectionItems(o.options ?? o.Options);
  const isControlField =
    readBool(o, "isControlField", "IsControlField") ||
    (controlField?.key === key);
  const selectionItems =
    options.length > 0
      ? options
      : isControlField && controlField?.key === key
        ? controlField.selectionItems
        : [];

  const description = readString(o, "purpose", "Purpose", "description", "Description");
  const defaultValue = readString(o, "default", "Default", "defaultValue", "DefaultValue");
  const explicitMultiLine = readBool(o, "isMultiLine", "IsMultiLine", "multiLine", "MultiLine");

  return {
    key,
    name: readString(o, "title", "Title", "name", "Name", "label", "Label"),
    description,
    varType,
    variableMode: inferVariableModeFromAgentInput(key, varType, selectionItems.length > 0, isControlField),
    isMultiLine: inferStepParamMultiline({
      key,
      description,
      defaultValue,
      varType,
      explicitMultiLine,
    }),
    isRequired: readBool(o, "required", "Required", "isRequired", "IsRequired"),
    validationPattern: "",
    selectionItems,
    isControlField,
    defaultValue,
    fromOldField: "",
    isAdvanced: readBool(o, "isAdvanced", "IsAdvanced"),
    allowInput: true,
    visibleExpression: "",
    replaceVariable: false,
    defaultHighlightType: "",
    skipEval: false,
    skipLogContent: false,
    validForList: [],
    invalidForList: [],
  };
}

function mapAgentOutputParamDef(raw: unknown): StepRunnerOutputParamDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const key = readString(o, "key", "Key");
  if (!key) return null;
  const valueType = readString(o, "valueType", "ValueType");
  return {
    key,
    name: readString(o, "title", "Title", "name", "Name"),
    description: readString(o, "purpose", "Purpose", "description", "Description"),
    varType: parseAgentValueType(valueType),
    isAdvanced: readBool(o, "isAdvanced", "IsAdvanced"),
    visibleExpression: "",
    customTypeName: readString(o, "customTypeName", "CustomTypeName"),
    skipLogContent: false,
    validForList: [],
    invalidForList: [],
  };
}

function mapInputParamDef(raw: unknown): StepRunnerInputParamDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const key = readString(o, "key", "Key");
  if (!key) return null;
  const varType = readInt(o, "varType", "VarType");
  const description = readString(o, "description", "Description", "purpose", "Purpose");
  const defaultValue = readString(o, "defaultValue", "DefaultValue", "default", "Default");
  const explicitMultiLine = readBool(o, "isMultiLine", "IsMultiLine", "multiLine", "MultiLine");
  return {
    key,
    name: readString(o, "name", "Name", "label", "Label", "title", "Title"),
    description,
    varType,
    variableMode: readInt(o, "variableMode", "VariableMode"),
    isMultiLine: inferStepParamMultiline({
      key,
      description,
      defaultValue,
      varType,
      explicitMultiLine,
    }),
    isRequired: readBool(o, "isRequired", "IsRequired", "required", "Required"),
    validationPattern: readString(o, "validationPattern", "ValidationPattern"),
    selectionItems: mapSelectionItems(o.selectionItems ?? o.SelectionItems ?? o.options ?? o.Options),
    isControlField: readBool(o, "isControlField", "IsControlField"),
    defaultValue,
    fromOldField: readString(o, "fromOldField", "FromOldField"),
    isAdvanced: readBool(o, "isAdvanced", "IsAdvanced"),
    allowInput: readBool(o, "allowInput", "AllowInput"),
    visibleExpression: readString(o, "visibleExpression", "VisibleExpression"),
    replaceVariable: readBool(o, "replaceVariable", "ReplaceVariable"),
    defaultHighlightType: readString(o, "defaultHighlightType", "DefaultHighlightType"),
    skipEval: readBool(o, "skipEval", "SkipEval"),
    skipLogContent: readBool(o, "skipLogContent", "SkipLogContent"),
    validForList: readStringArray(o, "validForList", "ValidForList"),
    invalidForList: readStringArray(o, "invalidForList", "InvalidForList"),
  };
}

function mapOutputParamDef(raw: unknown): StepRunnerOutputParamDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const key = readString(o, "key", "Key");
  if (!key) return null;
  return {
    key,
    name: readString(o, "name", "Name", "label", "Label", "title", "Title"),
    description: readString(o, "description", "Description", "purpose", "Purpose"),
    varType: readInt(o, "varType", "VarType") || parseAgentValueType(readString(o, "valueType", "ValueType")),
    isAdvanced: readBool(o, "isAdvanced", "IsAdvanced"),
    visibleExpression: readString(o, "visibleExpression", "VisibleExpression"),
    customTypeName: readString(o, "customTypeName", "CustomTypeName"),
    skipLogContent: readBool(o, "skipLogContent", "SkipLogContent"),
    validForList: readStringArray(o, "validForList", "ValidForList"),
    invalidForList: readStringArray(o, "invalidForList", "InvalidForList"),
  };
}

/** Read literal control-field value from step inputParams (for filtered step-runner get). */
export function resolveStepControlFieldLiteral(
  step: { inputParams?: Record<string, { varKey?: string; value?: string }> },
  controlFieldKey: string | undefined
): string | undefined {
  const cfKey = (controlFieldKey ?? "").trim();
  if (!cfKey) return undefined;
  const pin = step.inputParams?.[cfKey];
  if (!pin) return undefined;
  if ((pin.varKey ?? "").trim().length > 0) return undefined;
  const v = (pin.value ?? "").trim();
  return v.length > 0 ? v : undefined;
}

export function mapAgentSchemaToStepRunnerItem(schema: Record<string, unknown>) {
  const controlField = readControlFieldHint(schema);
  const inputRaw =
    schema.inputs ??
    schema.Inputs ??
    schema.inputParams ??
    schema.InputParams ??
    schema.inputParamDefs ??
    schema.InputParamDefs;
  const outputRaw =
    schema.outputs ??
    schema.Outputs ??
    schema.outputParams ??
    schema.OutputParams ??
    schema.outputParamDefs ??
    schema.OutputParamDefs;
  const inputParamDefs: StepRunnerInputParamDef[] = [];
  const outputParamDefs: StepRunnerOutputParamDef[] = [];

  const isAgentInputs =
    Array.isArray(inputRaw) &&
    inputRaw.length > 0 &&
    typeof inputRaw[0] === "object" &&
    inputRaw[0] !== null &&
    ("valueType" in (inputRaw[0] as object) || "ValueType" in (inputRaw[0] as object));

  if (Array.isArray(inputRaw)) {
    for (const row of inputRaw) {
      const mapped = isAgentInputs
        ? mapAgentInputParamDef(row, controlField)
        : mapInputParamDef(row);
      if (mapped) inputParamDefs.push(mapped);
    }
  }

  const isAgentOutputs =
    Array.isArray(outputRaw) &&
    outputRaw.length > 0 &&
    typeof outputRaw[0] === "object" &&
    outputRaw[0] !== null &&
    ("valueType" in (outputRaw[0] as object) || "ValueType" in (outputRaw[0] as object));

  if (Array.isArray(outputRaw)) {
    for (const row of outputRaw) {
      const mapped = isAgentOutputs ? mapAgentOutputParamDef(row) : mapOutputParamDef(row);
      if (mapped) outputParamDefs.push(mapped);
    }
  }

  if (
    controlField
    && controlField.selectionItems.some(
      (s) => (s.visibleInputKeys?.length ?? 0) > 0 || (s.visibleOutputKeys?.length ?? 0) > 0,
    )
  ) {
    applyValidForFromControlVisibleKeys(
      controlField,
      (s) => s.visibleInputKeys,
      inputParamDefs,
    );
    applyValidForFromControlVisibleKeys(
      controlField,
      (s) => s.visibleOutputKeys,
      outputParamDefs,
    );
  }

  const stepType = readString(schema, "stepType", "StepType");

  return {
    key: readString(schema, "stepRunnerKey", "StepRunnerKey", "key", "Key"),
    name: readString(schema, "name", "Name"),
    description: readString(schema, "description", "Description"),
    icon: readString(schema, "icon", "Icon"),
    category: readString(schema, "category", "Category"),
    secondaryCategories: readStringArray(schema, "secondaryCategories", "SecondaryCategories"),
    keywords: readStringArray(schema, "keywords", "Keywords"),
    supportedParams: inputParamDefs.map((d) => d.key).filter(Boolean),
    subItems: controlField?.selectionItems.map(
      (si): StepRunnerSubItem => ({
        key: si.value,
        name: si.name,
        description: si.description,
      })
    ) ?? [],
    stepType,
    inputParamDefs,
    outputParamDefs,
  };
}

export function mapSearchItemToStepRunnerItem(item: Record<string, unknown>) {
  return {
    key: readString(item, "key", "Key"),
    name: readString(item, "name", "Name"),
    description: readString(item, "description", "Description"),
    icon: readString(item, "icon", "Icon"),
    category: "",
    secondaryCategories: [],
    keywords: [],
    supportedParams: [],
    subItems: (Array.isArray(item.subItems) ? item.subItems : [])
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map(
        (sub): StepRunnerSubItem => ({
          key: readString(sub, "key", "Key"),
          name: readString(sub, "name", "Name"),
          description: readString(sub, "description", "Description"),
        }),
      ),
    stepType: readString(item, "stepType", "StepType"),
    inputParamDefs: [],
    outputParamDefs: [],
  };
}

/** True when item is already mapped (has inputParamDefs), not raw qkrpc schema. */
export function isMappedStepRunnerItem(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.inputParamDefs) && !Array.isArray(obj.inputs);
}
