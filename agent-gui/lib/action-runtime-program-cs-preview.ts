/** Client-side fallback when serve has not returned generatedProgramCs yet. */

import { expandWireInputParams } from "@/lib/input-param-wire";

type WireParam = { value?: string; varKey?: string; var?: string };

type WireStep = {

  stepRunnerKey?: string;

  disabled?: boolean;

  note?: string;

  delayMs?: number;

  inputParams?: Record<string, WireParam | string>;

  outputParams?: Record<string, string>;

  ifSteps?: WireStep[];

  elseSteps?: WireStep[];

};



type WireProgram = {

  title?: string;

  steps?: WireStep[];

  variables?: Array<{ key?: string; defaultValue?: string }>;

};



function escapeString(value: string): string {

  return value

    .replace(/\\/g, "\\\\")

    .replace(/"/g, '\\"')

    .replace(/\r/g, "\\r")

    .replace(/\n/g, "\\n");

}



function literal(value: string | undefined | null): string {

  if (value == null) return "null";

  return `"${escapeString(value)}"`;

}



function readParam(step: WireStep, key: string): WireParam | undefined {

  const raw = step.inputParams?.[key];

  if (raw == null) return undefined;

  if (typeof raw === "string") return { value: raw };

  return raw;

}



/** var ref → GetVar; $$ → Interpolate; $= → EvalExpression; else literal */

function formatParamValue(param: WireParam): string {

  const varKey = param.varKey ?? param.var;

  if (varKey?.trim()) {

    return `ctx.GetVar(${literal(varKey.trim())})`;

  }

  const value = param.value ?? "";

  if (!value) return '""';

  if (value.startsWith("$$")) {

    return `ctx.Interpolate(${literal(value)})`;

  }

  if (value.startsWith("$=")) {

    return `ctx.EvalExpression(${literal(value)}, useVariables: true)`;

  }

  return literal(value);

}



function formatInputExpr(step: WireStep, ...keys: string[]): string {

  for (const key of keys) {

    const param = readParam(step, key);

    if (!param) continue;

    if (param.varKey?.trim() || param.value?.trim()) {

      return formatParamValue(param);

    }

  }

  return '""';

}



function readOutputVar(step: WireStep, outputKey: string): string {

  const mapped = step.outputParams?.[outputKey];

  return mapped?.trim() ? mapped : outputKey;

}



function emitInputParamsDictionary(step: WireStep, indent: string, lines: string[]): void {

  const entries = Object.entries(step.inputParams ?? {}).filter(

    ([key]) => !key.endsWith(".var") && !key.endsWith(".file"),

  );

  if (entries.length === 0) {

    lines.push(`${indent}    new Dictionary<string, object>(),`);

    return;

  }

  lines.push(`${indent}    new Dictionary<string, object>`);

  lines.push(`${indent}    {`);

  for (const [paramKey, raw] of entries) {

    const param = typeof raw === "string" ? { value: raw } : raw;

    lines.push(`${indent}        [${literal(paramKey)}] = ${formatParamValue(param)},`);

  }

  lines.push(`${indent}    },`);

}



function emitOutputParamsDictionary(step: WireStep, indent: string, lines: string[]): void {

  const entries = Object.entries(step.outputParams ?? {});

  if (entries.length === 0) {

    lines.push(`${indent}    new Dictionary<string, string>());`);

    return;

  }

  lines.push(`${indent}    new Dictionary<string, string>`);

  lines.push(`${indent}    {`);

  for (const [paramKey, varKey] of entries) {

    lines.push(`${indent}        [${literal(paramKey)}] = ${literal(varKey)},`);

  }

  lines.push(`${indent}    }});`);

}



function collectSubProgramVarInputs(step: WireStep): Array<[string, WireParam]> {
  const expanded = expandWireInputParams(step.inputParams as Record<string, unknown> | undefined);
  const out: Array<[string, WireParam]> = [];
  for (const [key, param] of Object.entries(expanded)) {
    const lower = key.toLowerCase();
    if (!lower.startsWith("var:")) {
      continue;
    }
    const spVarName = key.slice(4);
    if (!spVarName) {
      continue;
    }
    out.push([spVarName, param]);
  }
  return out;
}

function emitRunSp(step: WireStep, indent: string, lines: string[]): void {
  const name = formatInputExpr(step, "subProgram");
  const varInputs = collectSubProgramVarInputs(step);

  if (varInputs.length === 0) {
    lines.push(`${indent}ctx.RunSp(${name}?.ToString() ?? "");`);
    return;
  }

  lines.push(`${indent}ctx.RunSp(`);
  lines.push(`${indent}    ${name}?.ToString() ?? "",`);
  lines.push(`${indent}    new Dictionary<string, object>`);
  lines.push(`${indent}    {`);
  for (const [spVarName, param] of varInputs) {
    lines.push(`${indent}        [${literal(spVarName)}] = ${formatParamValue(param)},`);
  }
  lines.push(`${indent}    }});`);
}

function emitExecuteStepFallback(step: WireStep, indent: string, lines: string[]): void {

  const key = step.stepRunnerKey ?? "unknown";

  lines.push(`${indent}ctx.ExecuteStep(`);

  lines.push(`${indent}    ${literal(key)},`);

  emitInputParamsDictionary(step, indent, lines);

  emitOutputParamsDictionary(step, indent, lines);

  lines.push(`${indent});`);

}



function emitStep(step: WireStep, index: number, indent: string, lines: string[]): void {

  const key = step.stepRunnerKey ?? "unknown";

  if (step.disabled) {

    lines.push(`${indent}// [${index}] ${key} (disabled)`);

    return;

  }



  lines.push(`${indent}// [${index}] ${key}`);

  if (step.note?.trim()) {

    lines.push(`${indent}// note: ${step.note.trim()}`);

  }



  switch (key) {

    case "sys:assign": {

      const outputVar = readOutputVar(step, "output");

      lines.push(`${indent}ctx.SetVar(${literal(outputVar)}, ${formatInputExpr(step, "input")});`);

      break;

    }

    case "sys:evalexpression":

    case "sys:compute": {

      const outputParam = key === "sys:compute" ? "output" : "result";

      const outputVar = readOutputVar(step, outputParam);

      const temp = `_${key.replace(/[:.-]/g, "_")}_${outputParam}`;

      lines.push(

        `${indent}var ${temp} = ctx.EvalExpression(${formatInputExpr(step, "expression")}, useVariables: true);`,

      );

      lines.push(`${indent}ctx.SetVar(${literal(outputVar)}, ${temp});`);

      break;

    }

    case "sys:if":

    case "sys:simpleIf": {

      lines.push(`${indent}if (ctx.EvalCondition(${formatInputExpr(step, "condition")}))`);

      lines.push(`${indent}{`);

      emitSteps(step.ifSteps ?? [], `${indent}    `, lines);

      lines.push(`${indent}}`);

      lines.push(`${indent}else`);

      lines.push(`${indent}{`);

      emitSteps(step.elseSteps ?? [], `${indent}    `, lines);

      lines.push(`${indent}}`);

      break;

    }

    case "sys:delay": {

      const ms = step.delayMs && step.delayMs > 0

        ? String(step.delayMs)

        : formatInputExpr(step, "milliseconds", "delayMs", "delay");

      lines.push(`${indent}ctx.Delay(TimeSpan.FromMilliseconds(${ms}));`);

      break;

    }

    case "sys:readFile": {

      const outputVar = readOutputVar(step, "txt");

      lines.push(`${indent}var _read_txt = System.IO.File.ReadAllText(${formatInputExpr(step, "path")});`);

      lines.push(`${indent}ctx.SetVar(${literal(outputVar)}, _read_txt);`);

      break;

    }

    case "sys:WriteTextFile": {

      lines.push(

        `${indent}System.IO.File.WriteAllText(${formatInputExpr(step, "filePath", "path")}, ${formatInputExpr(step, "content")}?.ToString() ?? "");`,

      );

      break;

    }

    case "sys:splitString": {

      const outputVar = readOutputVar(step, "output");

      lines.push(

        `${indent}var _split = (${formatInputExpr(step, "data")}?.ToString() ?? "").Split(${formatInputExpr(step, "separator")}?.ToString() ?? ",");`,

      );

      lines.push(`${indent}ctx.SetVar(${literal(outputVar)}, _split);`);

      break;

    }

    case "sys:group": {

      lines.push(`${indent}{`);

      emitSteps(step.ifSteps ?? [], `${indent}    `, lines);

      lines.push(`${indent}}`);

      break;

    }

    case "sys:each": {

      const itemVar = readOutputVar(step, "item");

      lines.push(`${indent}foreach (var _each_item in (System.Collections.IEnumerable)${formatInputExpr(step, "input")}!)`);

      lines.push(`${indent}{`);

      lines.push(`${indent}    ctx.SetVar(${literal(itemVar)}, _each_item);`);

      emitSteps(step.ifSteps ?? [], `${indent}    `, lines);

      lines.push(`${indent}}`);

      break;

    }

    case "sys:subprogram":

      emitRunSp(step, indent, lines);

      break;

    default:

      emitExecuteStepFallback(step, indent, lines);

  }

}



function emitSteps(steps: WireStep[], indent: string, lines: string[]): void {

  steps.forEach((step, index) => {

    emitStep(step, index, indent, lines);

    lines.push("");

  });

}



function parseProgramJson(value: unknown): WireProgram | undefined {

  if (!value) return undefined;

  if (typeof value === "string") {

    try {

      return JSON.parse(value) as WireProgram;

    } catch {

      return undefined;

    }

  }

  if (typeof value === "object") return value as WireProgram;

  return undefined;

}



export function previewProgramCsFromWire(program: unknown, title?: string): string | undefined {

  const wire = parseProgramJson(program);

  if (!wire || !Array.isArray(wire.steps)) return undefined;



  const lines: string[] = [

    "// ActionRuntime preview — generated from program JSON (client fallback)",

  ];

  if (title?.trim()) {

    lines.push(`// ${title.trim()}`);

  }

  lines.push("", "void Execute(IRuntimeContext ctx)", "{");



  if (Array.isArray(wire.variables) && wire.variables.length > 0) {

    lines.push("    // variables (defaults applied by runtime)");

    for (const variable of wire.variables) {

      const key = variable.key ?? "var";

      if (variable.defaultValue == null || variable.defaultValue === "") {

        lines.push(`    // ${key}`);

      } else {

        lines.push(`    ctx.SetVar(${literal(key)}, ${literal(variable.defaultValue)});`);

      }

    }

    lines.push("");

  }



  emitSteps(wire.steps, "    ", lines);

  lines.push("}");

  return lines.join("\n").trimEnd();

}



export function resolveGeneratedProgramCs(

  data: Record<string, unknown> | undefined,

  requestArgs: Record<string, unknown> | undefined,

): string | undefined {

  const fromServe = data?.generatedProgramCs;

  if (typeof fromServe === "string" && fromServe.trim()) {

    return fromServe;

  }



  const program =

    requestArgs?.xaction

    ?? requestArgs?.program

    ?? data?.compiledProgramJson

    ?? data?.sourceProgramJson;



  const title =

    typeof data?.actionTitle === "string"

      ? data.actionTitle

      : typeof (parseProgramJson(program))?.title === "string"

        ? parseProgramJson(program)!.title

        : undefined;



  return previewProgramCsFromWire(program, title);

}


