import type {
  StepRunnerInputParamDef,
  StepRunnerOutputParamDef,
  StepRunnerItem,
} from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import { resolveStepControlFieldLiteral } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import { inferControlFieldKeyFromStep } from "@/lib/action-editor/steps/stepControlFieldInfer";

function parseExpressionBody(raw: string): string {
  const expr = raw.trim();
  return expr.startsWith("$=") ? expr.slice(2).trim() : expr;
}

function tryEvaluateVisibleExpression(
  expression: string,
  paramValues: Record<string, string>,
): boolean {
  const body = parseExpressionBody(expression);
  if (!body) {
    return true;
  }

  const normalizedBody = Object.keys(paramValues).reduce(
    (acc, key) => acc.split(`{${key}}`).join(key),
    body,
  );

  const variableNames = Object.keys(paramValues);
  const variableValues = variableNames.map((name) => paramValues[name]);
  try {
    const evaluator = new Function(
      ...variableNames,
      `return Boolean(${normalizedBody});`,
    ) as (...args: string[]) => boolean;
    return evaluator(...variableValues);
  } catch {
    return true;
  }
}

function normalizeConditionList(list: string[] | undefined): string[] {
  return (list ?? []).map((x) => (x ?? "").trim()).filter((x) => x.length > 0);
}

function equalsIgnoreCase(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? "").localeCompare(b ?? "", "en", { sensitivity: "accent" }) === 0;
}

function findControlParamKeyForConditionList(
  list: string[],
  inputDefs: StepRunnerInputParamDef[],
): string | null {
  for (const def of inputDefs) {
    const items = def.selectionItems ?? [];
    if (items.length === 0) {
      continue;
    }
    const valueSet = new Set(
      items.map((x) => (x.value ?? "").trim().toLowerCase()).filter((x) => x.length > 0),
    );
    if (list.every((x) => valueSet.has(x.toLowerCase()))) {
      return def.key;
    }
  }
  return null;
}

function isExpressionLikeControlValue(value: string): boolean {
  const v = value.trim();
  return v.startsWith("$=") || v.includes("{");
}

function normalizeControlCompareValue(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value || isExpressionLikeControlValue(value)) {
    return "";
  }
  return value;
}

function controlSelectionValues(
  inputDefs: readonly StepRunnerInputParamDef[],
  controlKey: string,
): string[] {
  const def = inputDefs.find((d) => d.key === controlKey);
  return (def?.selectionItems ?? [])
    .map((x) => (x.value ?? "").trim())
    .filter((x) => x.length > 0);
}

/** Unknown control literal / varKey name → empty compare (show all mode-specific params). */
function normalizeKnownControlCompareValue(
  raw: string,
  inputDefs: readonly StepRunnerInputParamDef[],
  controlKey: string,
): string {
  const value = normalizeControlCompareValue(raw);
  if (!value) {
    return "";
  }
  const known = controlSelectionValues(inputDefs, controlKey);
  if (known.length === 0) {
    return value;
  }
  return known.some((k) => equalsIgnoreCase(k, value)) ? value : "";
}

function resolveCompareValueForConditionList(
  validList: string[],
  invalidList: string[],
  inputDefs: StepRunnerInputParamDef[],
  paramValues: Record<string, string>,
): string {
  const conditionList = validList.length > 0 ? validList : invalidList;
  if (conditionList.length === 0) {
    return "";
  }

  const matchedControlKey = findControlParamKeyForConditionList(conditionList, inputDefs);
  if (matchedControlKey) {
    return normalizeKnownControlCompareValue(
      paramValues[matchedControlKey] ?? "",
      inputDefs,
      matchedControlKey,
    );
  }

  let legacyFallback = "";
  for (const def of inputDefs) {
    if (def.isControlField && (def.selectionItems?.length ?? 0) > 0) {
      const currentValue = paramValues[def.key];
      if (currentValue != null) {
        legacyFallback = normalizeKnownControlCompareValue(
          currentValue,
          inputDefs,
          def.key,
        );
      }
    }
  }
  return legacyFallback;
}

export function buildStepParamValuesForVisibility(
  step: ActionStep,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(step.inputParams ?? {}).map(([key, pin]) => [
      key,
      (pin?.varKey ?? "").trim() || (pin?.value ?? "").trim(),
    ]),
  );
}

export function isParamDefVisibleForStep(
  def: Pick<
    StepRunnerInputParamDef | StepRunnerOutputParamDef,
    "visibleExpression" | "validForList" | "invalidForList"
  >,
  paramValues: Record<string, string>,
  inputDefs: readonly StepRunnerInputParamDef[],
): boolean {
  const validList = normalizeConditionList(def.validForList);
  const invalidList = normalizeConditionList(def.invalidForList);
  if (validList.length > 0 || invalidList.length > 0) {
    const compareValue = resolveCompareValueForConditionList(
      validList,
      invalidList,
      [...inputDefs],
      paramValues,
    );
    // Mirror StepRunnerInputParamVisibility: empty control value => all params visible.
    if (!compareValue) {
      return true;
    }
    if (validList.length > 0) {
      return validList.some((x) => equalsIgnoreCase(x, compareValue));
    }
    return !invalidList.some((x) => equalsIgnoreCase(x, compareValue));
  }

  const expr = (def.visibleExpression ?? "").trim();
  if (!expr) {
    return true;
  }
  return tryEvaluateVisibleExpression(expr, paramValues);
}

/** Clone runner defs limited to params visible for the step's current control mode. */
export function filterRunnerItemDefsForStep(
  runnerItem: StepRunnerItem,
  step: ActionStep,
): StepRunnerItem {
  const paramValues = buildStepParamValuesForVisibility(step);
  const inputDefs = runnerItem.inputParamDefs ?? [];
  const input = inputDefs.filter((def) =>
    isParamDefVisibleForStep(def, paramValues, inputDefs),
  );
  const output = (runnerItem.outputParamDefs ?? []).filter((def) =>
    isParamDefVisibleForStep(def, paramValues, inputDefs),
  );
  return {
    ...runnerItem,
    inputParamDefs: input,
    outputParamDefs: output,
  };
}

export function stepRunnerSchemaCacheKey(step: ActionStep): string {
  const key = (step.stepRunnerKey ?? "").trim();
  if (!key) return "";
  const cfKey = inferControlFieldKeyFromStep(step, undefined);
  const control = resolveStepControlFieldLiteral(step, cfKey || undefined);
  return control ? `${key}\0${control}` : key;
}

export type StepRunnerSchemaRequest = {
  key: string;
  controlLiteral?: string;
};

export function collectStepRunnerSchemaRequestsFromSteps(
  steps: readonly ActionStep[],
): StepRunnerSchemaRequest[] {
  const seen = new Set<string>();
  const out: StepRunnerSchemaRequest[] = [];

  const walk = (items: readonly ActionStep[]) => {
    for (const step of items) {
      const key = (step.stepRunnerKey ?? "").trim();
      if (key) {
        const cacheKey = stepRunnerSchemaCacheKey(step);
        if (!seen.has(cacheKey)) {
          seen.add(cacheKey);
          const cfKey = inferControlFieldKeyFromStep(step, undefined);
          out.push({
            key,
            controlLiteral: resolveStepControlFieldLiteral(step, cfKey || undefined),
          });
        }
      }
      walk(step.ifSteps ?? []);
      walk(step.elseSteps ?? []);
    }
  };

  walk(steps);
  return out;
}
