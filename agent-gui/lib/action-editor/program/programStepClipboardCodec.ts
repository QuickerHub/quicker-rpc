import { ActionVariable, ActionVariableInputParamInfo, ActionVariableOutputParamInfo, ActionTableDef, ActionTableField, type ActionStep } from "../types/common";
import { isLosslessJsonNumber, stringifyLosslessJson } from "../shared/losslessJson";
import { parseVariableReferenceJson } from "./programVariableReferences";
import { normalizeVariableClipboardRow, variableClipboardRowToDto, type VariableClipboardRow } from "./programVariableClipboard";
import { parseTypedWireString, parseWireParamKey } from "../../input-param-wire";

export type ClipboardRecord = Record<string, unknown>;
export type StepClipboardBody = { steps: ClipboardRecord[]; variables: VariableClipboardRow[]; subPrograms: ClipboardRecord[] };
export type StepClipboardFailure = { ok: false; code: string; error: string };
export type StepClipboardExportResult = { ok: true; text: string } | StepClipboardFailure;
export type StepClipboardPasteResult = { ok: true; changed: boolean; insertedIds: readonly string[] } | StepClipboardFailure;
export const record = (value: unknown): value is ClipboardRecord => value !== null && typeof value === "object" && !Array.isArray(value) && !isLosslessJsonNumber(value);
const pascal = (name: string) => name[0]!.toUpperCase() + name.slice(1);
export const defineClipboardField = (row: ClipboardRecord, key: string, value: unknown) => Object.defineProperty(row, key, {value,enumerable:true,writable:true,configurable:true});
export function clipboardRows(value: unknown, label: string): ClipboardRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(row => !record(row))) throw new Error(`${label} 不是可核验的对象集合`);
  return value;
}
function fields(raw: unknown, names: readonly string[], toDto = false, aliases: Record<string, readonly string[]> = {}): ClipboardRecord {
  if (!record(raw)) throw new Error("步骤剪贴板记录不是 JSON 对象");
  const result=structuredClone(raw);
  for(const key of names){
    const candidates=aliases[key]??[key,pascal(key)];
    const folded=new Set(candidates.map(name=>name.toLowerCase()));
    const present=Object.keys(raw).filter(name=>folded.has(name.toLowerCase()));
    if(present.some(name=>!candidates.includes(name))) throw new Error(`剪贴板 ${key} 含不可识别的大小写别名`);
    if(present.length>1) throw new Error(`剪贴板 ${key} 字段别名有歧义`);
    if(!present.length) continue;
    const value=raw[present[0]!];
    for(const name of candidates) delete result[name];
    defineClipboardField(result,toDto?pascal(key):key,structuredClone(value));
  }
  return result;
}
const stepFields=["stepRunnerKey","inputParams","outputParams","ifSteps","elseSteps","note","disabled","collapsed","delayMs","stepId"];
const stepAliases={stepRunnerKey:["stepRunnerKey","StepRunnerKey","key","Key"],inputParams:["inputParams","InputParams","inputs","Inputs"],outputParams:["outputParams","OutputParams","outputs","Outputs"]};
const programFields=["id","name","description","icon","kind","steps","variables","subPrograms","stepCount","variableCount","summaryExpression"];
export const clipboardProgramMetadata=(raw:unknown)=>fields(raw,programFields);
export function normalizeClipboardVariable(raw:unknown):VariableClipboardRow {
  const row=fields(raw,Object.keys(ActionVariable.create()),false,{varType:["varType","VarType","Type"],defaultValue:["defaultValue","DefaultValue","default","default_value"]});
  for(const [key,defaults] of [["inputParamInfo",ActionVariableInputParamInfo.create()],["outputParamInfo",ActionVariableOutputParamInfo.create()],["tableDef",ActionTableDef.create()]] as const){
    if(row[key]!==undefined&&row[key]!==null)row[key]=fields(row[key],Object.keys(defaults));
  }
  if(record(row.tableDef)&&row.tableDef.fields!==undefined)row.tableDef.fields=clipboardRows(row.tableDef.fields,"table fields").map(field=>fields(field,Object.keys(ActionTableField.create())));
  for(const key of Object.keys(row)) if(["default.file","defaultvalue.file","defaultvaluefile"].includes(key.toLowerCase())&&!["default.file","defaultValue.file","defaultValueFile","DefaultValueFile"].includes(key))throw new Error("外置默认值字段别名不可核验");
  return normalizeVariableClipboardRow(row);
}

function normalizeInputs(value: unknown): ClipboardRecord {
  if(value===undefined||value===null) return {};
  if(!record(value)) throw new Error("步骤输入集合不可核验");
  const result:ClipboardRecord={};
  for(const [wireKey,raw] of Object.entries(value)){
    const {baseKey,kind}=parseWireParamKey(wireKey);
    if(Object.hasOwn(result,baseKey)) throw new Error("同一输入含多个绑定来源，不能安全迁移");
    if(kind==="file") throw new Error("步骤引用外置文件；缺少文件归属和移交证明，请保留原文档");
    let pin:unknown;
    if(raw===null) pin=null;
    else if(record(raw)) pin=fields(raw,["varKey","value","file"]);
    else if(typeof raw==="string") pin=kind==="var"?{varKey:raw}:parseTypedWireString(raw)??{value:raw};
    else throw new Error("输入正文不是可核验的文字或绑定对象");
    if(record(pin)){
      for(const name of ["varKey","value","file"]) if(pin[name]!==undefined&&pin[name]!==null&&typeof pin[name]!=="string") throw new Error("输入绑定的文本类型未知");
      if(typeof pin.file==="string"&&pin.file.length) throw new Error("步骤引用外置文件；缺少文件归属和移交证明，请保留原文档");
      if(typeof pin.varKey==="string"&&pin.varKey!==pin.varKey.trim()) throw new Error("变量绑定包含非规范空白，不能改写引用");
    }
    defineClipboardField(result,baseKey,pin);
  }
  return result;
}
export function normalizeClipboardStep(raw: unknown): ClipboardRecord {
  const step=fields(raw,stepFields,false,stepAliases);
  if(typeof step.stepRunnerKey!=="string"||!step.stepRunnerKey.trim()) throw new Error("步骤缺少可核验的模块标识");
  if(step.stepId!==undefined&&typeof step.stepId!=="string") throw new Error("步骤身份不是文字");
  for(const key of ["note"]) if(step[key]!==undefined&&step[key]!==null&&typeof step[key]!=="string") throw new Error("步骤备注不是文字");
  if(step.inputParams!==undefined&&step.inputParams!==null)step.inputParams=normalizeInputs(step.inputParams);
  if(step.outputParams!==undefined&&step.outputParams!==null&&!record(step.outputParams)) throw new Error("步骤输出集合不可核验");
  for(const value of Object.values((step.outputParams as ClipboardRecord)??{})) if(value!==null&&typeof value!=="string") throw new Error("输出绑定不是文字");
  for(const key of ["ifSteps","elseSteps"]) if(step[key]!==undefined&&step[key]!==null) step[key]=clipboardRows(step[key],key).map(normalizeClipboardStep);
  return step;
}
export function normalizeClipboardProgram(raw: unknown): ClipboardRecord {
  const body=fields(raw,programFields);
  if(body.kind!==undefined&&body.kind!==0&&body.kind!==1) throw new Error("仅支持有完整本地正文的内部子程序，外部引用未获移交证明");
  if(typeof body.name!=="string"||!body.name||body.name!==body.name.trim()||body.name.startsWith("%")||body.name.startsWith("@@")) throw new Error("内部子程序名称不可核验");
  if(body.id!==undefined&&typeof body.id!=="string") throw new Error("子程序身份不是文字");
  body.steps=clipboardRows(body.steps,"steps").map(normalizeClipboardStep);
  body.variables=clipboardRows(body.variables,"variables").map(normalizeClipboardVariable);
  body.subPrograms=clipboardRows(body.subPrograms,"subPrograms").map(normalizeClipboardProgram);
  return body;
}
export function normalizeClipboardBody(raw: unknown): StepClipboardBody {
  const body=fields(raw,["steps","variables","subPrograms"]);
  const steps=clipboardRows(body.steps,"steps").map(normalizeClipboardStep);
  if(!steps.length) throw new Error("剪贴板没有可粘贴的步骤");
  return {steps,variables:clipboardRows(body.variables,"variables").map(normalizeClipboardVariable),subPrograms:clipboardRows(body.subPrograms,"subPrograms").map(normalizeClipboardProgram)};
}
function stepToDto(raw: ClipboardRecord): ClipboardRecord {
  const result=fields(raw,stepFields,true);
  const inputs:ClipboardRecord={};
  if(record(raw.inputParams)){
    for(const [key,value] of Object.entries(raw.inputParams)) defineClipboardField(inputs,key,record(value)?fields(value,["varKey","value","file"],true):value);
    result.InputParams=inputs;
  }
  for(const key of ["ifSteps","elseSteps"]) if(Array.isArray(raw[key])) result[pascal(key)]=(raw[key] as ClipboardRecord[]).map(stepToDto);
  return result;
}
function programToDto(raw: ClipboardRecord): ClipboardRecord {
  const result=fields(raw,programFields,true);
  result.Steps=clipboardRows(raw.steps,"steps").map(stepToDto);
  result.Variables=clipboardRows(raw.variables,"variables").map(variableClipboardRowToDto);
  result.SubPrograms=clipboardRows(raw.subPrograms,"subPrograms").map(programToDto);
  return result;
}
export function serializeStepClipboardBody(body:StepClipboardBody):string {
  return stringifyLosslessJson({Steps:body.steps.map(stepToDto),Variables:body.variables.map(variableClipboardRowToDto),SubPrograms:body.subPrograms.map(programToDto)},2);
}
export function parseStepClipboardBody(text:string):StepClipboardBody {return normalizeClipboardBody(parseVariableReferenceJson(text));}
export function clipboardStepProjection(step:ClipboardRecord):ActionStep {
  const pinMap:Record<string,unknown>={};
  for(const [key,pin] of Object.entries((step.inputParams as ClipboardRecord)??{})) defineClipboardField(pinMap,key,pin===null?{value:"",varKey:""}:{value:"",varKey:"",...(pin as ClipboardRecord)});
  return {...structuredClone(step),inputParams:pinMap,outputParams:Object.fromEntries(Object.entries((step.outputParams as ClipboardRecord)??{}).map(([key,value])=>[key,value??""])),
    ifSteps:clipboardRows(step.ifSteps,"ifSteps").map(clipboardStepProjection),elseSteps:clipboardRows(step.elseSteps,"elseSteps").map(clipboardStepProjection)} as unknown as ActionStep;
}
export function applyClipboardProjection(step:ClipboardRecord, projected:ActionStep):void {
  const inputs=(step.inputParams as ClipboardRecord)??{};
  for(const [key,pin] of Object.entries(inputs)) if(record(pin)) for(const name of ["varKey","value"]) {
    if(typeof pin[name]==="string") pin[name]=projected.inputParams[key]?.[name as "varKey"|"value"]??pin[name];
  }
  if(record(step.outputParams)) for(const key of Object.keys(step.outputParams)) if(typeof step.outputParams[key]==="string") step.outputParams[key]=projected.outputParams[key]??step.outputParams[key];
  for(const key of ["ifSteps","elseSteps"] as const) clipboardRows(step[key],key).forEach((child,index)=>applyClipboardProjection(child,projected[key][index]!));
}
