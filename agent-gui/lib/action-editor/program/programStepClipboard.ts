import type { ActionStep, ActionVariable } from "../types/common";
import type { XProgramPresent } from "./xProgramHistory";
import { findStepById, normalizeSelectionForMove } from "../steps/stepTreeOps";
import { variableClipboardRowToEditor } from "./programVariableClipboard";
import { ACTION_VARIABLE_IDENTIFIER_SOURCE } from "../steps/paramEditors/stepParamCreateVariable";
import { transformClipboardVariableReferences } from "./programVariableReferences";
import { isReservedVariableKey } from "../steps/paramEditors/stepParamBuiltinVariables";
import { quoteSubProgramConstant } from "../document/programDocumentSubProgramModel";
import { record, clipboardRows, normalizeClipboardStep, normalizeClipboardProgram, parseStepClipboardBody, serializeStepClipboardBody,
  clipboardStepProjection, applyClipboardProjection, clipboardProgramMetadata, normalizeClipboardVariable, defineClipboardField, type ClipboardRecord, type StepClipboardBody,
  type StepClipboardExportResult, type StepClipboardFailure } from "./programStepClipboardCodec";

type Scope={body:ClipboardRecord;steps:ClipboardRecord[];variables:ClipboardRecord[];programs:Scope[];needed:Set<string>;calls:{step:ClipboardRecord;callee:Scope}[];used:boolean;
  selected?:ClipboardRecord[];renames?:Map<string,{to:string;varType:number}>;name?:string};
// This is a bounded local clipboard adapter, not connected native dependency evidence.
// Other runners and callback carriers stay unsupported until their dependency semantics are available.
const structuralRunners=new Set(["sys:comment","sys:delay","sys:if","sys:simpleIf","sys:group","sys:evalexpression","sys:subprogram"]);
const configInputs=new Set(["subProgram","summary","skipDebugOutput","stopIfFail"]),configOutputs=new Set(["isSuccess","errMessage"]);
const identifier=(row:ClipboardRecord,key:string):string=>{
  const names=[key,key[0]!.toUpperCase()+key.slice(1)].filter(name=>Object.hasOwn(row,name));
  if(names.length!==1||typeof row[names[0]!]!=="string") throw new Error(`剪贴板 ${key} 身份缺失或有歧义`);
  const value=row[names[0]!] as string;if(!value||value!==value.trim()) throw new Error(`剪贴板 ${key} 含非规范空白`);return value;
};
function unsafeOpaque(value:unknown):boolean {
  if(typeof value==="string") return new RegExp(`\\{(${ACTION_VARIABLE_IDENTIFIER_SOURCE})(?=[}.\\[])|\\$=|\\$\\$|\\$sp\\$|GetVarValue|SetVarValue|quickerGetVar|quickerSetVar`,"u").test(value);
  if(Array.isArray(value)) return value.some(unsafeOpaque);
  return record(value)&&Object.values(value).some(unsafeOpaque);
}
function assertOpaqueFields(row:ClipboardRecord,known:ReadonlySet<string>):void {
  for(const [key,value] of Object.entries(row)) if(!known.has(key)&&unsafeOpaque(value)) throw new Error(`未知字段 ${key} 可能含依赖，尚不能证明可移交`);
}
function scope(body:ClipboardRecord,steps?:ClipboardRecord[]):Scope {
  for(const key of ["steps","variables","subPrograms"]) if(Object.keys(body).some(name=>name!==key&&name.toLowerCase()===key.toLowerCase())) throw new Error("程序集合别名不能安全定位");
  const variables=clipboardRows(body.variables,"variables"),names=new Set<string>();
  for(const row of variables){const key=identifier(row,"key");if(names.has(key)) throw new Error("原变量名称不唯一");names.add(key);}
  const result:Scope={body,steps:structuredClone(steps??clipboardRows(body.steps,"steps")),variables,programs:[],needed:new Set(),calls:[],used:false};
  result.programs=clipboardRows(body.subPrograms,"subPrograms").map(child=>scope(clipboardProgramMetadata(child)));
  return result;
}
const allScopes=(root:Scope):Scope[]=>[root,...root.programs.flatMap(allScopes)];
const walkSteps=(steps:ClipboardRecord[]):ClipboardRecord[]=>steps.flatMap(step=>[step,...walkSteps(clipboardRows(step.ifSteps,"ifSteps")),...walkSteps(clipboardRows(step.elseSteps,"elseSteps"))]);
function scan(scope:Scope,steps:ClipboardRecord[],variables:ClipboardRecord[],renames?:Scope["renames"]){
  const projected={steps:steps.map(clipboardStepProjection),variables:variables.map(variableClipboardRowToEditor)};
  const result=transformClipboardVariableReferences(projected,{knownKeys:new Set(scope.variables.map(row=>identifier(row,"key"))),renames});
  if(!result.ok) throw new Error(result.error);
  return result;
}
function requireReferences(owner:Scope,keys:readonly {key:string}[]):void {
  const names=new Set(owner.variables.map(row=>identifier(row,"key")));
  for(const {key} of keys){
    if(isReservedVariableKey(key))continue;
    if(names.has(key)) owner.needed.add(key);
    else throw new Error(`变量「${key}」不属于本次局部原文，不能证明其依赖`);
  }
}
function callTarget(step:ClipboardRecord):string {
  if(Object.hasOwn(step,"subProgram")) throw new Error("步骤级子程序简写尚未取得明确的调用参数映射");
  const pin=(step.inputParams as ClipboardRecord|undefined)?.subProgram;
  if(!record(pin)||pin.file||pin.varKey||typeof pin.value!=="string"||!pin.value||pin.value!==pin.value.trim()) throw new Error("子程序调用目标是动态、外置或缺失值");
  const value=pin.value;
  if(/[{}]/u.test(value))throw new Error("子程序名称或常量目标含原生插值标记，不能安全重命名");
  if(value.startsWith("%")||value.startsWith("@@")||value.startsWith("$$")) throw new Error("外部或动态子程序没有本次移交证明");
  if(!value.startsWith("$=")) return value;
  try {const name=JSON.parse(value.slice(2));if(typeof name==="string"&&`$=${quoteSubProgramConstant(name)}`===value)return name;}catch{}
  throw new Error("子程序表达式不是可核验的原生常量");
}
function graph(root:Scope):Scope {
  const scopes=allScopes(root),visited=new Set<string>();
  const visit=(owner:Scope,callers:Scope[]):void=>{
    const visible=new Set([owner,...callers].flatMap(item=>item.programs));
    const key=`${scopes.indexOf(owner)}:${[...visible].map(item=>scopes.indexOf(item)).sort((a,b)=>a-b).join(',')}`;
    if(visited.has(key))return;visited.add(key);
    if(!owner.used)owner.steps=owner.steps.map(normalizeClipboardStep);
    owner.used=true;
    if(owner!==root){
      if(owner.body.kind!==undefined&&owner.body.kind!==0&&owner.body.kind!==1)throw new Error("被调用子程序不是有本地正文的内部程序");
      identifier(owner.body,"name");
      assertOpaqueFields(owner.body,new Set(["id","name","kind","description","icon","steps","variables","subPrograms","stepCount","variableCount"]));
      for(const row of owner.variables)if((row.isInput??row.IsInput)===true||(row.isOutput??row.IsOutput)===true)owner.needed.add(identifier(row,"key"));
    }
    for(const step of walkSteps(owner.steps)){
      if(!structuralRunners.has(String(step.stepRunnerKey)))throw new Error(`模块 ${step.stepRunnerKey} 尚无本地可核验的完整依赖规则，请保留原步骤`);
      assertOpaqueFields(step,new Set(["stepId","stepRunnerKey","inputParams","outputParams","ifSteps","elseSteps","note","disabled","collapsed","delayMs"]));
      for(const pin of Object.values((step.inputParams as ClipboardRecord)??{}))if(record(pin))assertOpaqueFields(pin,new Set(["varKey","value","file"]));
      if(step.stepRunnerKey!=="sys:subprogram")continue;
      const target=callTarget(step),matches=scopes.filter(item=>item!==root&&(item.body.name??item.body.Name)===target);
      if(matches.length!==1||!visible.has(matches[0]!))throw new Error(`内部调用「${target}」缺失、存在同名遮蔽或超出本次调用上下文`);
      const callee=matches[0]!;
      for(const [map,config,flag] of [[step.inputParams,configInputs,"isInput"],[step.outputParams,configOutputs,"isOutput"]] as const){
        for(const label of Object.keys((map as ClipboardRecord)??{})){
          if(config.has(label))continue;
          if(!label.startsWith("var:"))throw new Error("子程序旧式裸参数名缺少明确执行映射，不能静默改名");
          const name=label.slice(4),rows=callee.variables.filter(row=>identifier(row,"key")===name&&row[flag]===true);
          if(rows.length!==1)throw new Error(`子程序接口参数 ${label} 没有唯一原文定义`);
        }
      }
      if(!owner.calls.some(call=>call.step===step))owner.calls.push({step,callee});
      visit(callee,[owner,...callers]);
    }
    requireReferences(owner,scan(owner,owner.steps,[]).references);
    const checked=new Set<string>();
    while([...owner.needed].some(key=>!checked.has(key))){
      for(const name of [...owner.needed])if(!checked.has(name)){
        checked.add(name);const row=normalizeClipboardVariable(owner.variables.find(row=>identifier(row,"key")===name));
        requireReferences(owner,scan(owner,[],[row]).references);
      }
    }
    owner.selected=owner.variables.filter(row=>owner.needed.has(identifier(row,"key"))).map(normalizeClipboardVariable);
  };
  visit(root,[]);return root;
}
function bodyOf(owner:Scope):StepClipboardBody {
  return {steps:owner.steps,variables:owner.selected??[],subPrograms:owner.programs.filter(item=>item.used).map(item=>{
    const body=bodyOf(item);return normalizeClipboardProgram({...structuredClone(item.body),...body});
  })};
}
export function exportRawStepsClipboard(body:ClipboardRecord,steps:ClipboardRecord[]):string {return serializeStepClipboardBody(bodyOf(graph(scope(body,steps))));}

export function exportProgramSteps(present:XProgramPresent,ids:readonly string[]):StepClipboardExportResult{
  try{
    const roots=normalizeSelectionForMove(present.steps,[...ids]);if(!roots.length)throw new Error("请先选择要复制的步骤");
    const steps=roots.map(id=>{const step=findStepById(present.steps,id);if(!step)throw new Error("所选步骤不存在");return structuredClone(step) as unknown as ClipboardRecord;});
    return{ok:true,text:exportRawStepsClipboard({...structuredClone(present),subPrograms:[]},steps)};
  }catch(error){return{ok:false,code:"step_clipboard_unsupported",error:error instanceof Error?error.message:"无法安全复制步骤"};}
}
export function prepareProgramStepsPaste(present:XProgramPresent,text:string,afterId:string|null):{ok:true;present:XProgramPresent;insertedIds:string[]}|StepClipboardFailure{
  try{
    if(parseStepClipboardBody(text).subPrograms.length)throw new Error("内部子程序粘贴需要原文档 Session，当前独立编辑面尚不支持");
    const document={...structuredClone(present),subPrograms:[]} as unknown as ClipboardRecord;
    const insertedIds=appendRawStepsClipboard(document,document,text,afterId);
    return{ok:true,insertedIds,present:{steps:clipboardRows(document.steps,"steps").map(clipboardStepProjection),variables:clipboardRows(document.variables,"variables").map(variableClipboardRowToEditor)}};
  }catch(error){return{ok:false,code:"step_clipboard_unsupported",error:error instanceof Error?error.message:"无法安全粘贴步骤"};}
}

/** Allocate the whole batch before rewriting, then append to the current transaction draft. */
export function appendRawStepsClipboard(document:ClipboardRecord,target:ClipboardRecord,text:string,afterId:string|null,reservedIds:readonly string[]=[]):string[]{
  const incoming=parseStepClipboardBody(text),root=graph(scope(incoming as unknown as ClipboardRecord));
  const ids=new Set(reservedIds),names=new Set<string>();
  const reserve=(value:unknown):void=>{
    if(Array.isArray(value)){value.forEach(reserve);return;}if(!record(value))return;
    for(const key of ["id","Id","stepId","StepId"])if(typeof value[key]==="string")ids.add(value[key] as string);
    for(const key of ["key","Key","name","Name"])if(typeof value[key]==="string")names.add((value[key] as string).toLowerCase());
    for(const key of ["steps","ifSteps","elseSteps","variables","subPrograms"])reserve(value[key]);
  };reserve(document);
  let counter=1;
  const id=(prefix:string)=>{while(ids.has(`${prefix}-clipboard-${counter}`))counter++;const result=`${prefix}-clipboard-${counter++}`;ids.add(result);return result;};
  const name=(base:string)=>{let candidate=`${base}_copy`,suffix=2;while(names.has(candidate.toLowerCase()))candidate=`${base}_copy_${suffix++}`;names.add(candidate.toLowerCase());return candidate;};
  for(const owner of allScopes(root).filter(owner=>owner.used)){
    owner.renames=new Map();
    for(const row of owner.selected??[]){
      const key=String(row.key),to=name(key);owner.renames.set(key,{to,varType:variableClipboardRowToEditor(row).varType});row.id=id("v");
    }
    if(owner!==root){owner.name=name(identifier(owner.body,"name"));owner.body.id=id("p");owner.body.name=owner.name;}
    for(const step of walkSteps(owner.steps))step.stepId=id("s");
  }
  for(const owner of allScopes(root).filter(owner=>owner.used)){
    const updated=scan(owner,owner.steps,owner.selected??[],owner.renames).present;
    owner.steps.forEach((step,index)=>applyClipboardProjection(step,updated.steps[index]!));
    (owner.selected??[]).forEach((row,index)=>{
      const projected=updated.variables[index]!;row.key=owner.renames!.get(String(row.key))!.to;
      if(typeof row.defaultValue==="string")row.defaultValue=projected.defaultValue;
      for(const kind of ["inputParamInfo","outputParamInfo"] as const)if(record(row[kind])&&typeof row[kind].visibleExpression==="string")row[kind].visibleExpression=projected[kind]?.visibleExpression??row[kind].visibleExpression;
    });
    for(const {step,callee} of owner.calls){
      const inputs=step.inputParams as ClipboardRecord;(inputs.subProgram as ClipboardRecord).value=`$=${quoteSubProgramConstant(callee.name!)}`;
      for(const map of [inputs,step.outputParams])if(record(map))for(const key of Object.keys(map))if(key.startsWith("var:")){
        const next=callee.renames!.get(key.slice(4))?.to;if(!next)throw new Error("调用接口映射缺失");
        const value=map[key];delete map[key];defineClipboardField(map,`var:${next}`,value);
      }
    }
  }
  const pasted=bodyOf(root),steps=clipboardRows(target.steps,"steps"),variables=clipboardRows(target.variables,"variables"),programs=clipboardRows(target.subPrograms,"subPrograms");
  let location:{list:ClipboardRecord[];index:number}|undefined;
  const find=(list:ClipboardRecord[]):void=>{for(const [index,step]of list.entries()){if(step.stepId===afterId){if(location)throw new Error("粘贴位置身份不唯一");location={list,index};}find(clipboardRows(step.ifSteps,"ifSteps"));find(clipboardRows(step.elseSteps,"elseSteps"));}};
  if(afterId){find(steps);if(!location)throw new Error("粘贴位置缺少稳定原文身份或已不存在；旧式无 ID 步骤尚不支持异步定位，原文未变");}
  if(location)location.list.splice(location.index+1,0,...pasted.steps);else steps.push(...pasted.steps);
  target.steps=steps;target.variables=[...variables,...pasted.variables];target.subPrograms=[...programs,...pasted.subPrograms];
  if(Object.hasOwn(target,"stepCount"))target.stepCount=steps.length;if(Object.hasOwn(target,"variableCount"))target.variableCount=variables.length+pasted.variables.length;
  return pasted.steps.map(step=>String(step.stepId));
}
