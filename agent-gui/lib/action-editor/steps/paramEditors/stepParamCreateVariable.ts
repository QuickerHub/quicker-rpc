import { ActionVariable } from "@/lib/action-editor/types/common";
import { actionVariableRowKey } from "../../variables/actionVariableUi";
import { CsVarType } from "./csStepEnums";

const CSHARP_RESERVED = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked", "class", "const",
  "continue", "decimal", "default", "delegate", "do", "double", "else", "enum", "event", "explicit", "extern",
  "false", "finally", "fixed", "float", "for", "foreach", "goto", "if", "implicit", "in", "int", "interface",
  "internal", "is", "lock", "long", "namespace", "new", "null", "object", "operator", "out", "override",
  "params", "private", "protected", "public", "readonly", "ref", "return", "sbyte", "sealed", "short",
  "sizeof", "stackalloc", "static", "string", "struct", "switch", "this", "throw", "true", "try", "typeof",
  "uint", "ulong", "unchecked", "unsafe", "ushort", "using", "virtual", "void", "volatile", "while",
]);

/** Mirrors XActionUiHelper.NormalizeParamName for preset keys from step param defs. */
export function normalizeParamNameForVariable(presetVarName: string): string {
  let text = presetVarName.trim();
  if (!text) {
    return "";
  }
  if (text.toLowerCase().startsWith("var:")) {
    text = text.slice(4).trim();
  }
  if (!isValidActionVariableKey(text)) {
    return `_${text}`;
  }
  return text;
}

/** Mirrors VariableHelper.IsValidVarName (C# identifier); allows literal `params` like desktop editor. */
export function isValidActionVariableKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "params") {
    return true;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return false;
  }
  return !CSHARP_RESERVED.has(trimmed);
}

/** Enum params create Text variables on desktop (XActionUiHelper.CreateVariable). */
export function resolveCreateVariableTargetType(paramVarType: number): number {
  if (paramVarType === CsVarType.Enum) {
    return CsVarType.Text;
  }
  return paramVarType;
}

export function suggestVariableKeyFromParam(
  paramKey: string,
  existingVariables: readonly ActionVariable[],
): string {
  const normalized = normalizeParamNameForVariable(paramKey);
  const occupied = new Set(
    existingVariables
      .map((v) => actionVariableRowKey(v).trim())
      .filter((k) => k.length > 0),
  );
  if (normalized && !occupied.has(normalized)) {
    return normalized;
  }
  const stamp = String(Date.now()).slice(-4);
  const fallback = `var_${stamp}`;
  if (!occupied.has(fallback)) {
    return fallback;
  }
  return `var_${Date.now()}`;
}

export function findExistingVariableByKey(
  variables: readonly ActionVariable[],
  key: string,
): ActionVariable | undefined {
  const trimmed = key.trim();
  if (!trimmed) {
    return undefined;
  }
  return variables.find((v) => actionVariableRowKey(v) === trimmed);
}

export type StepParamCreateVariableRequest = {
  paramKey: string;
  paramName: string;
  targetVarType: number;
  /** Output param row uses VariableSelector.isForOutput semantics. */
  isOutput?: boolean;
};

export function createActionVariableDraft(input: {
  key: string;
  varType: number;
  desc?: string;
}): ActionVariable {
  const key = input.key.trim();
  return ActionVariable.create({
    id: `v-${Date.now()}`,
    key,
    varType: input.varType,
    defaultValue: "",
    desc: (input.desc ?? "").trim(),
    isLocked: false,
    saveState: false,
    isInput: false,
    isOutput: false,
    paramName: "",
    group: "",
    customType: "",
  });
}
