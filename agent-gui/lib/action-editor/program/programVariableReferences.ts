import type { ActionVariable } from "../types/common";
import type { XProgramPresent } from "./xProgramHistory";
import { programDocumentFingerprint } from "../document/programDocumentWire";
import { isLosslessJsonNumber, parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import { CsVarType } from "../steps/paramEditors/csStepEnums";
import { isReservedVariableKey } from "../steps/paramEditors/stepParamBuiltinVariables";
import { ACTION_VARIABLE_IDENTIFIER_SOURCE, isValidActionVariableKey } from "../steps/paramEditors/stepParamCreateVariable";

export type ProgramVariableChangeRequest =
  | { kind: "edit"; expected: ActionVariable; next: ActionVariable }
  | { kind: "delete"; expected: readonly ActionVariable[] };
export type ProgramVariableChangeResult = { ok: true; changed: boolean } | { ok: false; code: string; error: string };
export type PreparedProgramVariableChange = { ok: true; changed: boolean; present: XProgramPresent } | Extract<ProgramVariableChangeResult, { ok: false }>;
type RecordValue = Record<string, unknown>;
type Reference = { key: string; path: string };
type Scan = { references: Reference[]; unknown: string[]; keys?: ReadonlySet<string>; rename?: { from: ActionVariable; to: string } };
const bindingPattern = new RegExp(`^(${ACTION_VARIABLE_IDENTIFIER_SOURCE})(.*)$`, "u");
const isRecord = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) && !isLosslessJsonNumber(value);
const fail = (code: string, error: string): Extract<ProgramVariableChangeResult, { ok: false }> => ({ ok: false, code, error });
const same = (a: unknown, b: unknown) => programDocumentFingerprint(a) === programDocumentFingerprint(b);
function possibleReference(value: unknown, scan: Scan): boolean {
  if (typeof value === "string") return [...value.matchAll(new RegExp(`\\{(${ACTION_VARIABLE_IDENTIFIER_SOURCE})(?=\\}|\\.|\\[)`, "gu"))]
    .some((match) => scan.rename ? match[1] === scan.rename.from.key : scan.keys?.has(match[1]!));
  if (Array.isArray(value)) return value.some((item) => possibleReference(item, scan));
  return isRecord(value) && Object.values(value).some((item) => possibleReference(item, scan));
}

/** Duplicate JSON keys cannot participate in a lossless, unambiguous reference transaction. */
export function parseVariableReferenceJson(content: string): unknown {
  const scopes: ({ kind: "object"; keys: Set<string>; key: boolean } | { kind: "array" })[] = [];
  for (const match of content.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)) {
    const token = match[0], scope = scopes.at(-1);
    if (token === "{") scopes.push({ kind: "object", keys: new Set(), key: true });
    else if (token === "[") scopes.push({ kind: "array" });
    else if (token === "}" || token === "]") scopes.pop();
    else if (token === "," && scope?.kind === "object") scope.key = true;
    else if (token.startsWith('"') && scope?.kind === "object" && scope.key) {
      const key = JSON.parse(token) as string;
      if (scope.keys.has(key)) throw new Error("引用正文包含重复 JSON 字段，不能安全修改");
      scope.keys.add(key); scope.key = false;
    }
  }
  return parseLosslessJson(content);
}

function reference(scan: Scan, key: string, path: string): string {
  scan.references.push({ key, path });
  return scan.rename?.from.key === key ? scan.rename.to : key;
}

function binding(value: string, scan: Scan, path: string, members = true): string {
  const match = bindingPattern.exec(value);
  if (!match || (match[2] && (!members || !/^[.[]/.test(match[2])))) return value;
  return reference(scan, match[1]!, path) + match[2];
}

/** Native interpolation happens before expression evaluation, including quoted placeholders. */
function expression(value: string, scan: Scan, path: string, force = false): string {
  if (!force && !value.startsWith("$=") && !value.startsWith("$$")) return value;
  const updated = value.replace(new RegExp(`\\{(${ACTION_VARIABLE_IDENTIFIER_SOURCE})(?=\\}|\\.|\\[)`, "gu"), (whole, key: string, at: number) => {
    const suffix = value[at + whole.length];
    scan.references.push({ key, path });
    if (scan.rename?.from.key !== key) return whole;
    if (suffix !== "}" && scan.rename.from.varType !== CsVarType.List && scan.rename.from.varType !== CsVarType.Dict) {
      scan.unknown.push(`${path}: 集合成员引用与原变量类型不一致`); return whole;
    }
    return "{" + scan.rename.to;
  });
  return value.startsWith("$=") ? script(updated, "cs", scan, path) : updated;
}

type ScriptToken = { text: string; start: number; end: number; literal?: string };
/** A deliberately bounded lexical subset; no execution or regex replacement over source text. */
function script(value: string, language: "cs" | "js" | "py", scan: Scan, path: string): string {
  const tokens: ScriptToken[] = [];
  const unsupported = () => { scan.unknown.push(`${path}: 脚本包含无法静态核验的变量访问或字符串语法`); return value; };
  for (let i = 0; i < value.length;) {
    const start = i, c = value[i]!;
    if (/\s/u.test(c)) { i++; continue; }
    if (value.startsWith("$=") && c === "{" && new RegExp(`^\\{${ACTION_VARIABLE_IDENTIFIER_SOURCE}(?=\\}|\\.|\\[)`, "u").test(value.slice(i))) {
      const end = value.indexOf("}", i + 1); if (end < 0) return unsupported(); i = end + 1; continue;
    }
    if (language === "py" && c === "#") { while (i < value.length && !/[\r\n]/.test(value[i]!)) i++; continue; }
    if (language !== "py" && value.startsWith("//", i)) { while (i < value.length && !/[\r\n]/.test(value[i]!)) i++; continue; }
    if (language !== "py" && value.startsWith("/*", i)) { const end = value.indexOf("*/", i + 2); if (end < 0) return unsupported(); i = end + 2; continue; }
    if (c === "`" || (language === "cs" && (c === "@" || c === "$") && value[i + 1] === '"')) return unsupported();
    if (c === '"' || c === "'") {
      if (value.slice(i, i + 3) === c.repeat(3)) return unsupported();
      if (language === "py" && tokens.at(-1)?.end === i && /^[frbu]+$/i.test(tokens.at(-1)!.text)) return unsupported();
      i++; let escaped = false;
      while (i < value.length && value[i] !== c) {
        if (value[i] === "\\") { escaped = true; i += 2; } else i++;
      }
      if (i >= value.length) return unsupported();
      i++;
      tokens.push({ text: value.slice(start, i), start, end: i, ...(!escaped ? { literal: value.slice(start + 1, i - 1) } : {}) });
      continue;
    }
    // Escaped identifiers (for example quicker\u0047etVar) are executable names,
    // not ordinary punctuation. Never declare their variable references complete.
    if (c === "\\") return unsupported();
    const word = /^[\p{L}_$][\p{L}\p{Nd}_$]*/u.exec(value.slice(i));
    if (word) { i += word[0].length; tokens.push({ text: word[0], start, end: i }); continue; }
    // A JavaScript regex literal could contain names that are not code. Do not guess its grammar.
    if (language === "js" && c === "/") return unsupported();
    i++; tokens.push({ text: c, start, end: i });
  }
  const patches: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (["eval", "exec", "Function", "require", "import", "__import__", "globalThis", "window", "this", "self"].includes(token.text)) return unsupported();
    if (token.text === "]" && tokens[i + 1]?.text === "(") return unsupported();
    const prefix = language === "cs" ? ["context", "."] : language === "py" ? ["quicker", ".", "context", "."] : [];
    const methods = language === "js" ? ["quickerGetVar", "quickerSetVar"] : ["GetVarValue", "SetVarValue"];
    if (!methods.includes(token.text)) {
      if ((language === "cs" && token.text === "context") || (language === "py" && token.text === "quicker")) {
        if (language === "cs" && tokens[i - 1]?.text === "IStepContext" && [")", ","].includes(tokens[i + 1]?.text ?? "")) continue;
        if (tokens[i - 1]?.text === "." || !prefix.every((part, n) => tokens[i + n]?.text === part) || !methods.includes(tokens[i + prefix.length]?.text ?? "")) return unsupported();
      }
      continue;
    }
    if (prefix.some((part, n) => tokens[i - prefix.length + n]?.text !== part)
      || (language === "js" && tokens[i - 1]?.text === ".") || tokens[i + 1]?.text !== "(") return unsupported();
    const arg = tokens[i + 2], delimiter = tokens[i + 3]?.text;
    if (arg?.literal === undefined || delimiter !== (token.text === methods[0] ? ")" : ",")) return unsupported();
    const replacement = reference(scan, arg.literal, path);
    if (replacement !== arg.literal) patches.push({ start: arg.start + 1, end: arg.end - 1, text: replacement });
  }
  let output = value;
  for (const patch of patches.reverse()) output = output.slice(0, patch.start) + patch.text + output.slice(patch.end);
  return output;
}

function form(value: string, scan: Scan, path: string, operation?: XProgramPresent["steps"][number]["inputParams"][string]): string {
  if (!value.trim()) return value;
  let body: unknown;
  try { body = parseVariableReferenceJson(value); } catch { scan.unknown.push(`${path}: 表单正文不是可核验且字段唯一的 JSON`); return value; }
  if (!isRecord(body) || (Object.hasOwn(body, "Fields") && Object.hasOwn(body, "fields"))) { scan.unknown.push(`${path}: 表单结构不明确`); return value; }
  if (operation?.varKey || operation?.file || operation?.value?.startsWith("$=") || operation?.value?.startsWith("$$")) { scan.unknown.push(`${path}: 表单模式是动态值`); return value; }
  const modes = ["mode", "Mode"].filter((key) => Object.hasOwn(body, key));
  if (modes.length > 1) { scan.unknown.push(`${path}: 表单模式别名有歧义`); return value; }
  const mode = String(body[modes[0] ?? "mode"] ?? operation?.value ?? "variables").trim().toLowerCase();
  if (modes.length && operation?.value?.trim() && String(body[modes[0]!]).toLowerCase() !== operation.value.trim().toLowerCase()) { scan.unknown.push(`${path}: 表单正文与步骤模式冲突`); return value; }
  if (mode !== "variables" && mode !== "dict_dynamic") { scan.unknown.push(`${path}: 表单模式未知`); return value; }
  const dictionary = mode === "dict_dynamic";
  const dictKeys = ["dictVar", "DictVar"].filter((key) => Object.hasOwn(body, key));
  if (dictKeys.length > 1 || (dictKeys.length && typeof body[dictKeys[0]!] !== "string")) { scan.unknown.push(`${path}: 词典变量绑定不明确`); return value; }
  if (dictionary && dictKeys.length) body[dictKeys[0]!] = binding(body[dictKeys[0]!] as string, scan, `${path}/${dictKeys[0]}`, false);
  const fieldName = Object.hasOwn(body, "Fields") ? "Fields" : "fields";
  const fields = body[fieldName];
  if (!Array.isArray(fields) || fields.some((field) => !isRecord(field))) { scan.unknown.push(`${path}: 表单字段结构暂不支持`); return value; }
  for (const [name, data] of Object.entries(body)) if (![fieldName, "mode", "Mode", "dictVar", "DictVar", "schema", "$schema"].includes(name)
    && possibleReference(data, scan)) scan.unknown.push(`${path}/${name}: 表单扩展字段可能引用变量`);
  for (const [index, field] of (fields as RecordValue[]).entries()) {
    const domain = ["FieldKey", "fieldKey"].filter((key) => Object.hasOwn(field, key));
    const targets = ["target", "Target"].filter((key) => Object.hasOwn(field, key));
    const identifiers = ["key", "Key"].filter((key) => Object.hasOwn(field, key));
    // In quicker.form.v1, key is the field id; target is the actual variable binding.
    const keys = domain.length ? domain : targets.length ? targets : identifiers;
    if (domain.length > 1 || targets.length > 1 || identifiers.length > 1 || (domain.length && targets.length)) {
      scan.unknown.push(`${path}/${index}: 表单目标别名有歧义`); continue;
    }
    if (keys.length !== 1 || typeof field[keys[0]!] !== "string") { scan.unknown.push(`${path}/${index}: 表单目标不明确`); continue; }
    const key = keys[0]!;
    if (!dictionary) {
      const replacement = binding(field[key] as string, scan, `${path}/${index}/${key}`, false);
      // A v1 visibleWhen.field points to the UI field id, not the bound variable.
      if (replacement !== field[key] && identifiers.includes(key)) field.target = replacement;
      else field[key] = replacement;
    }
    const expressionFields = ["SelectionItems", "selectionItems", "Label", "HelpText", "helpText", "VisibleExpression", "DefaultValue", "MinValue", "minValue", "MaxValue", "maxValue", "items", "label", "help", "visibleExpression", "def", "default", "defaultValue", "min", "max"];
    for (const group of [["Label", "label"], ["HelpText", "helpText", "help"], ["SelectionItems", "selectionItems", "items"], ["VisibleExpression", "visibleExpression"], ["DefaultValue", "defaultValue", "default", "def"], ["MinValue", "minValue", "min"], ["MaxValue", "maxValue", "max"]]) {
      if (group.filter((name) => Object.hasOwn(field, name)).length > 1) scan.unknown.push(`${path}/${index}: 表单表达式字段别名有歧义`);
    }
    for (const name of expressionFields) {
      if (typeof field[name] !== "string") continue;
      if (dictionary && possibleReference(field[name], scan)) scan.unknown.push(`${path}/${index}/${name}: 词典表单表达式作用域尚不能核验`);
      else if (!dictionary) field[name] = expression(field[name] as string, scan, `${path}/${index}/${name}`);
    }
    for (const name of ["options", "Options"]) if (Array.isArray(field[name])) {
      field[name] = (field[name] as unknown[]).map((option, optionIndex) => {
        if (dictionary && possibleReference(option, scan)) { scan.unknown.push(`${path}/${index}/${name}: 词典选项表达式作用域尚不能核验`); return option; }
        if (dictionary) return option;
        if (typeof option === "string") return expression(option, scan, `${path}/${index}/${name}/${optionIndex}`);
        if (isRecord(option)) for (const part of ["value", "Value", "label", "Label"]) {
          if (typeof option[part] === "string") option[part] = expression(option[part] as string, scan, `${path}/${index}/${name}/${optionIndex}/${part}`);
        }
        return option;
      });
    }
    const known = new Set([...keys, ...identifiers, ...targets, ...expressionFields, "options", "Options", "visibleWhen"]);
    for (const [name, data] of Object.entries(field)) if (!known.has(name) && possibleReference(data, scan)) scan.unknown.push(`${path}/${index}/${name}: 未知表单字段可能引用变量`);
  }
  return scan.rename && !same(body, parseLosslessJson(value)) ? stringifyLosslessJson(body) : value;
}

function httpBody(value: string, mode: XProgramPresent["steps"][number]["inputParams"][string] | undefined, scan: Scan, path: string): string {
  const candidate = mode?.value?.trim() || "JSON";
  if (mode?.file || mode?.varKey || candidate.startsWith("$=") || candidate.startsWith("$$")) {
    scan.unknown.push(`${path}: HTTP 正文模式是动态值`); return value;
  }
  if (["JSON", "FORM", "Text"].some((known) => known.toLowerCase() === candidate.toLowerCase())) return expression(value, scan, path);
  const imageValue = (body: string): string => /^IMG:/i.test(body) ? body.slice(0, 4) + binding(body.slice(4), scan, path, false) : body;
  if (candidate.toLowerCase() === "binaryfile") return imageValue(expression(value, scan, path));
  if (candidate.toLowerCase() === "file") {
    if (value.startsWith("$=") || value.startsWith("$$")) { scan.unknown.push(`${path}: Multipart 动态正文不能静态定位图片变量`); return value; }
    return value.replace(/[^\r\n]+/g, (line) => { const split = line.indexOf("="); return split < 0 ? line : line.slice(0, split + 1) + imageValue(line.slice(split + 1)); });
  }
  scan.unknown.push(`${path}: HTTP 正文模式未知`); return value;
}

function scanProgram(present: XProgramPresent, scan: Scan): void {
  scan.keys ??= new Set(present.variables.map((variable) => variable.key));
  const visit = (steps: XProgramPresent["steps"], path: string): void => {
    for (const [index, step] of steps.entries()) {
      const stepPath = `${path}/${index}`;
      for (const [key, pin] of Object.entries(step.inputParams ?? {})) {
        const pinPath = `${stepPath}/inputParams/${key}`;
        if (pin.file?.trim()) { scan.unknown.push(`${pinPath}: 外置正文尚未纳入本次事务`); continue; }
        if (pin.varKey?.trim()) { pin.varKey = binding(pin.varKey, scan, pinPath); continue; }
        if (typeof pin.value !== "string") { scan.unknown.push(`${pinPath}: 参数正文不可核验`); continue; }
        if (key === "formDef" || key === "dynamicFormForDictDef" || key === "formSpec") {
          if (step.stepRunnerKey !== "sys:form") { if (pin.value.trim()) scan.unknown.push(`${pinPath}: 表单参数不属于已知表单模块`); }
          else pin.value = form(pin.value, scan, pinPath,
            key === "dynamicFormForDictDef" ? { varKey: "", value: "dict_dynamic" } : step.inputParams.operation);
        }
        else if (key === "script" && pin.value.trim()) {
          const language = ({ "sys:csscript": "cs", "sys:jsscript": "js", "sys:pythonscript": "py" } as const)[step.stepRunnerKey as "sys:csscript"];
          if (language) pin.value = script(pin.value, language, scan, pinPath);
          else scan.unknown.push(`${pinPath}: 脚本语言未知`);
        } else if (step.stepRunnerKey === "sys:http" && key === "body" && /IMG:/i.test(pin.value)) {
          pin.value = httpBody(pin.value, step.inputParams.bodyType, scan, pinPath);
        } else if (!pin.value.startsWith("$=") && !pin.value.startsWith("$$") && possibleReference(pin.value, scan)) {
          scan.unknown.push(`${pinPath}: 普通文本含变量占位符，缺少当前 ReplaceVariable 参数契约`);
        } else pin.value = expression(pin.value, scan, pinPath);
      }
      for (const [key, value] of Object.entries(step.outputParams ?? {})) {
        if (typeof value !== "string") scan.unknown.push(`${stepPath}/outputParams/${key}: 输出绑定未知`);
        else step.outputParams[key] = binding(value, scan, `${stepPath}/outputParams/${key}`);
      }
      visit(step.ifSteps ?? [], `${stepPath}/ifSteps`); visit(step.elseSteps ?? [], `${stepPath}/elseSteps`);
    }
  };
  visit(present.steps, "steps");
  for (const [index, variable] of present.variables.entries()) {
    const raw = variable as unknown as RecordValue;
    if (typeof raw.defaultValueFile === "string" && raw.defaultValueFile.trim()) scan.unknown.push(`variables/${index}: 外置默认值尚未纳入本次事务`);
    else if (typeof variable.defaultValue !== "string") scan.unknown.push(`variables/${index}: 默认值结构未知`);
    else variable.defaultValue = expression(variable.defaultValue, scan, `variables/${index}/defaultValue`);
    for (const kind of ["inputParamInfo", "outputParamInfo"] as const) {
      const info = variable[kind];
      if (info && typeof info.visibleExpression === "string") info.visibleExpression = expression(info.visibleExpression, scan, `variables/${index}/${kind}/visibleExpression`);
      if (info) for (const [name, data] of Object.entries(info)) if (name !== "visibleExpression" && possibleReference(data, scan)) scan.unknown.push(`variables/${index}/${kind}/${name}: 参数扩展引用尚不能核验`);
    }
    const known = new Set(["id", "key", "varType", "defaultValue", "defaultValueFile", "desc", "isLocked", "saveState", "isInput", "isOutput", "paramName", "group", "customType", "inputParamInfo", "outputParamInfo"]);
    for (const [name, data] of Object.entries(raw)) if (!known.has(name) && possibleReference(data, scan)) scan.unknown.push(`variables/${index}/${name}: 变量扩展引用尚不能核验`);
  }
}

export function analyzeProgramVariableReferences(present: XProgramPresent):
  | { ok: true; references: readonly Reference[] } | Extract<ProgramVariableChangeResult, { ok: false }> {
  const scan: Scan = { references: [], unknown: [] };
  scanProgram(structuredClone(present), scan);
  return scan.unknown.length ? fail("unsupported_reference", scan.unknown[0]!) : { ok: true, references: scan.references };
}

export function getUnusedProgramVariables(present: XProgramPresent):
  | { ok: true; variables: ActionVariable[] } | Extract<ProgramVariableChangeResult, { ok: false }> {
  const analysis = analyzeProgramVariableReferences(present);
  if (!analysis.ok) return analysis;
  const used = new Set(analysis.references.map((entry) => entry.key));
  return { ok: true, variables: structuredClone(present.variables.filter((variable) => !variable.isLocked
    && !variable.isInput && !variable.isOutput && !used.has(variable.key))) };
}

/** Raw surface summaries are not in the editor projection; keep their changes in the same transaction. */
export function changeProgramVariableExpression(value: string, request: ProgramVariableChangeRequest):
  | { ok: true; value: string } | Extract<ProgramVariableChangeResult, { ok: false }> {
  const scan: Scan = { references: [], unknown: [], ...(request.kind === "edit"
    ? { rename: { from: request.expected, to: request.next.key.trim() } } : {}) };
  const next = expression(value, scan, "summaryExpression", true);
  if (scan.unknown.length) return fail("unsupported_reference", scan.unknown[0]!);
  if (request.kind === "delete") {
    const keys = new Set(request.expected.map((row) => row.key));
    if (scan.references.some((entry) => keys.has(entry.key))) return fail("variable_referenced", "变量仍被程序摘要表达式引用");
  }
  return { ok: true, value: next };
}

/** Prepare a complete local-scope edit; the caller commits once to its existing document history. */
export function prepareProgramVariableChange(present: XProgramPresent, request: ProgramVariableChangeRequest): PreparedProgramVariableChange {
  const expected = request.kind === "edit" ? [request.expected] : [...request.expected];
  if (!expected.length) return { ok: true, changed: false, present: structuredClone(present) };
  if (new Set(expected.map((item) => item.id)).size !== expected.length) return fail("variable_conflict", "删除目标重复，请重新核对变量");
  for (const original of expected) {
    const matches = present.variables.filter((item) => item.id === original.id);
    if (!original.id || matches.length !== 1 || !same(matches[0], original)) return fail("variable_conflict", "变量已经改变或目标不明确，请保留草稿并重新核对");
  }
  const next = structuredClone(present);
  if (request.kind === "edit") {
    const name = request.next.key.trim();
    if (request.next.id !== request.expected.id) return fail("variable_identity", "变量的稳定标识不能改变");
    if ((!isValidActionVariableKey(name) || isReservedVariableKey(name)) && name !== request.expected.key) return fail("variable_name", "变量名无效或属于运行时保留名称");
    if (present.variables.some((row) => row.id !== request.expected.id && row.key.trim().toLowerCase() === name.toLowerCase())) return fail("variable_name", "变量名称已经存在");
    const index = next.variables.findIndex((row) => row.id === request.expected.id);
    next.variables[index] = { ...structuredClone(request.next), key: name };
    if (request.expected.key !== name) {
      if (request.expected.isInput || request.expected.isOutput || request.next.isInput || request.next.isOutput) return fail("variable_interface", "接口变量改名需要同步调用者参数；当前事务未包含调用者，请保留原名称");
      if (present.variables.filter((row) => row.key === request.expected.key).length !== 1) return fail("variable_conflict", "原变量名不唯一，不能安全更新引用");
      const scan: Scan = { references: [], unknown: [], rename: { from: request.expected, to: name } };
      scanProgram(next, scan);
      if (scan.unknown.length) return fail("unsupported_reference", scan.unknown[0]!);
    }
  } else {
    if (expected.some((row) => row.isLocked)) return fail("variable_protected", "受保护变量不能删除，请先关闭保护");
    if (expected.some((row) => row.isInput || row.isOutput)) return fail("variable_interface", "接口变量仍可能被调用者使用，当前事务不能删除");
    const analysis = analyzeProgramVariableReferences(present);
    if (!analysis.ok) return analysis;
    const keys = new Set(expected.map((row) => row.key));
    const used = analysis.references.find((entry) => keys.has(entry.key));
    if (used) return fail("variable_referenced", `变量「${used.key}」仍被引用：${used.path}`);
    const ids = new Set(expected.map((row) => row.id));
    next.variables = next.variables.filter((row) => !ids.has(row.id));
  }
  return { ok: true, changed: !same(present, next), present: next };
}
