import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import { CsVarType } from "./csStepEnums";

const SCRIPT_PARAM_KEY_RE = /(?:^|_)(script|code|expr|expression|csharp|jscode|pythoncode|sql|template)(?:$|_)/i;

const SCRIPT_FILE_EXT_RE = /\.(cs|js|ts|tsx|jsx|py|lua|vbs|ps1|sql|json|xml|html|css|sh|bat|cmd|txt|md)$/i;

const MULTILINE_DESCRIPTION_RE = /每行|一行一个|多行|换行|multiline|multi-line|one per line|each line/i;

function isMultilineVarType(varType: number): boolean {
  return (
    varType === CsVarType.List
    || varType === CsVarType.Dict
    || varType === CsVarType.Form
    || varType === CsVarType.FormForDict
    || varType === CsVarType.Table
  );
}

function isScriptLikeExternalFile(filePath: string): boolean {
  const normalized = filePath.trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized.startsWith("files/")) {
    return false;
  }
  return SCRIPT_FILE_EXT_RE.test(normalized);
}

function isScriptLikeParamKey(key: string): boolean {
  const lower = key.trim().toLowerCase();
  if (!lower) return false;
  return SCRIPT_PARAM_KEY_RE.test(lower);
}

function descriptionIndicatesMultiline(description: string): boolean {
  const text = description.trim();
  if (!text) return false;
  return MULTILINE_DESCRIPTION_RE.test(text);
}

function textIndicatesMultiline(text: string): boolean {
  return text.includes("\n") || text.includes("\r");
}

export type StepParamMultilineInput = {
  key: string;
  description?: string;
  defaultValue?: string;
  varType: number;
  explicitMultiLine?: boolean;
  param?: ActionStepParam;
};

/** Infer multiline editor for a step input param (schema mapping + live editor). */
export function inferStepParamMultiline(input: StepParamMultilineInput): boolean {
  if (input.explicitMultiLine === true) {
    return true;
  }

  if (isMultilineVarType(input.varType)) {
    return true;
  }

  const key = (input.key ?? "").trim();
  if (isScriptLikeParamKey(key)) {
    return true;
  }

  if (descriptionIndicatesMultiline(input.description ?? "")) {
    return true;
  }

  if (textIndicatesMultiline(input.defaultValue ?? "")) {
    return true;
  }

  const param = input.param;
  const file = (param?.file ?? "").trim();
  if (file && isScriptLikeExternalFile(file)) {
    return true;
  }

  if (!(param?.varKey ?? "").trim() && textIndicatesMultiline(param?.value ?? "")) {
    return true;
  }

  return false;
}

/** Whether a step input param should use multiline auto-grow editor (scripts, files/, lists). */
export function resolveStepParamMultiline(
  def: StepRunnerInputParamDef,
  param?: ActionStepParam,
): boolean {
  return inferStepParamMultiline({
    key: def.key,
    description: def.description,
    defaultValue: def.defaultValue,
    varType: def.varType,
    explicitMultiLine: def.isMultiLine,
    param,
  });
}
