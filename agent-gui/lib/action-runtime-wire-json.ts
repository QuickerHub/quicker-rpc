/** Compact ActionRuntime program JSON to workspace wire shape (matches data.json). */

type WireParam = { value?: string; varKey?: string; var?: string; file?: string };
type WireStep = {
  stepRunnerKey?: string;
  disabled?: boolean;
  delayMs?: number;
  collapsed?: boolean;
  stepId?: string;
  note?: string;
  inputParams?: Record<string, WireParam | string | boolean | number>;
  outputParams?: Record<string, string>;
  ifSteps?: WireStep[];
  elseSteps?: WireStep[];
};

type WireVariable = {
  key?: string;
  default?: string;
  "default.file"?: string;
  defaultValue?: string;
  isOutput?: boolean;
  [key: string]: unknown;
};

type WireProgram = {
  steps?: WireStep[];
  variables?: WireVariable[];
  subPrograms?: WireProgram[];
  limitSingleInstance?: boolean;
  summaryExpression?: string;
};

function parseWireParam(raw: WireParam | string | boolean | number | undefined): WireParam {
  if (raw == null) return {};
  if (typeof raw === "string") return { value: raw };
  if (typeof raw === "boolean" || typeof raw === "number") return { value: String(raw) };
  return raw;
}

function compactInputParams(
  inputParams: Record<string, WireParam | string | boolean | number> | undefined,
): Record<string, string | boolean | number> | undefined {
  if (!inputParams) return undefined;
  const out: Record<string, string | boolean | number> = {};
  for (const [key, raw] of Object.entries(inputParams)) {
    if (key.endsWith(".var") || key.endsWith(".file")) {
      const base = key.replace(/\.(var|file)$/i, "");
      out[`${base}${key.endsWith(".file") ? ".file" : ".var"}`] = String(raw);
      continue;
    }
    const param = parseWireParam(raw);
    const file = param.file?.trim();
    if (file) {
      out[`${key}.file`] = file.replace(/\\/g, "/");
      continue;
    }
    const varKey = (param.varKey ?? param.var)?.trim();
    if (varKey) {
      out[`${key}.var`] = varKey;
      continue;
    }
    if (param.value != null && param.value !== "") {
      out[key] = param.value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function compactVariable(variable: WireVariable): WireVariable {
  const key = variable.key ?? "var";
  const out: WireVariable = { key };
  const file =
    variable["default.file"]
    ?? (typeof variable.defaultValue === "object"
      && variable.defaultValue
      && "file" in (variable.defaultValue as object)
      ? String((variable.defaultValue as { file?: string }).file ?? "")
      : undefined);
  if (file?.trim()) {
    out["default.file"] = file.trim().replace(/\\/g, "/");
  } else {
    const inline =
      variable.default
      ?? (typeof variable.defaultValue === "string" ? variable.defaultValue : "");
    if (inline !== undefined) {
      out.default = inline;
    }
  }
  if (variable.isOutput === true) {
    out.isOutput = true;
  }
  return out;
}

function stepHasElseBranch(stepRunnerKey: string): boolean {
  const tail = stepRunnerKey.split(":").pop()?.toLowerCase() ?? "";
  return tail === "if" || tail === "simpleif";
}

function stepHasIfBranch(stepRunnerKey: string): boolean {
  const tail = stepRunnerKey.split(":").pop()?.toLowerCase() ?? "";
  if (stepHasElseBranch(stepRunnerKey)) return true;
  return ["loop", "group", "each", "repeat", "foreach", "for", "while", "dowhile"].includes(tail);
}

function compactStep(step: WireStep): WireStep {
  const key = step.stepRunnerKey ?? "";
  const out: WireStep = { stepRunnerKey: key };
  const inputParams = compactInputParams(step.inputParams);
  if (inputParams) out.inputParams = inputParams;
  if (step.outputParams && Object.keys(step.outputParams).length > 0) {
    out.outputParams = step.outputParams;
  }
  if (step.disabled === true) out.disabled = true;
  if ((step.delayMs ?? 0) > 0) out.delayMs = step.delayMs;
  if (step.ifSteps?.length && stepHasIfBranch(key)) {
    out.ifSteps = step.ifSteps.map(compactStep);
  }
  if (step.elseSteps?.length && stepHasElseBranch(key)) {
    out.elseSteps = step.elseSteps.map(compactStep);
  }
  return out;
}

export function compactProgramWireJson(
  program: unknown,
  options?: { omitSubProgramBodies?: boolean },
): string | undefined {
  if (!program) return undefined;
  let root: WireProgram;
  if (typeof program === "string") {
    try {
      root = JSON.parse(program) as WireProgram;
    } catch {
      return undefined;
    }
  } else if (typeof program === "object") {
    const obj = program as WireProgram & { program?: WireProgram };
    root = obj.program ?? obj;
  } else {
    return undefined;
  }

  if (!Array.isArray(root.steps)) return undefined;

  const compacted: WireProgram = {
    steps: root.steps.map(compactStep),
  };
  if (Array.isArray(root.variables) && root.variables.length > 0) {
    compacted.variables = root.variables.map(compactVariable);
  }
  if (
    !options?.omitSubProgramBodies
    && Array.isArray(root.subPrograms)
    && root.subPrograms.length > 0
  ) {
    compacted.subPrograms = root.subPrograms
      .map((sub) => {
        const text = compactProgramWireJson(sub, options);
        return text ? (JSON.parse(text) as WireProgram) : sub;
      });
  }

  return `${JSON.stringify(compacted, null, 2)}\n`;
}

export function formatActionRuntimeInputJson(program: unknown): string | undefined {
  return compactProgramWireJson(program, { omitSubProgramBodies: true });
}
