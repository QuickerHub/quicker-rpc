import type { ProgramDocumentEditOptions, ProgramDocumentEditResult, ProgramDocumentSession } from "./programDocumentSession";
import { readClipboardSurface, readClipboardVariables } from "./programDocumentVariableClipboard";
import { appendRawStepsClipboard, exportRawStepsClipboard } from "../program/programStepClipboard";
import { clipboardRows, record, type ClipboardRecord, type StepClipboardExportResult } from "../program/programStepClipboardCodec";
import { parseVariableReferenceJson } from "../program/programVariableReferences";
import type { ActionStep, ActionSubProgram } from "../types/common";

function projectedSurface(session:ProgramDocumentSession,surface:string){
  const snapshot=session.readSnapshot();if(surface==="main")return snapshot;
  const matches:ActionSubProgram[]=[];
  const visit=(rows:ActionSubProgram[])=>{for(const row of rows){if(`sub-${row.id}`===surface)matches.push(row);visit(row.subPrograms);}};
  visit(snapshot.subPrograms);if(matches.length!==1)throw new Error("步骤编辑面不存在或身份不唯一");return matches[0]!;
}
function branches(step:ClipboardRecord,key:string):ClipboardRecord[]{
  const names=[key,key[0]!.toUpperCase()+key.slice(1)].filter(name=>Object.hasOwn(step,name));
  if(names.length>1)throw new Error("分支集合有歧义别名");return clipboardRows(step[names[0]??key],key);
}
export function exportProgramDocumentSteps(session:ProgramDocumentSession,surface:string,ids:readonly string[]):StepClipboardExportResult{
  try{
    if(session.isClosed())throw new Error("原文档会话已经关闭");
    if(!ids.length||ids.some(id=>!id.trim())||new Set(ids).size!==ids.length)throw new Error("请选择具有唯一身份的步骤");
    const document=parseVariableReferenceJson(session.getState().content);if(!record(document))throw new Error("程序正文不是对象");
    const body=readClipboardSurface(document,surface);readClipboardVariables(body);
    const projected=projectedSurface(session,surface),selected=new Set(ids),found=new Set<string>(),seen=new Set<string>(),roots:ClipboardRecord[]=[];
    const visit=(rows:ClipboardRecord[],projection:ActionStep[],ancestorSelected=false):void=>{
      if(rows.length!==projection.length)throw new Error("步骤原文与编辑投影不能一一对应");
      rows.forEach((raw,index)=>{
        const view=projection[index]!;if(!view.stepId||seen.has(view.stepId))throw new Error("步骤身份不唯一");seen.add(view.stepId);
        const aliases=["stepId","StepId"].filter(name=>Object.hasOwn(raw,name));
        if(aliases.length>1||(aliases.length&&raw[aliases[0]!]!==view.stepId))throw new Error("步骤原文身份与编辑投影不一致");
        const picked=selected.has(view.stepId);if(picked){found.add(view.stepId);if(!ancestorSelected)roots.push(structuredClone(raw));}
        visit(branches(raw,"ifSteps"),view.ifSteps,ancestorSelected||picked);visit(branches(raw,"elseSteps"),view.elseSteps,ancestorSelected||picked);
      });
    };
    visit(clipboardRows(body.steps,"steps"),projected.steps);
    if(found.size!==selected.size)throw new Error("所选步骤已不存在");
    return {ok:true,text:exportRawStepsClipboard(body,roots)};
  }catch(error){return{ok:false,code:"step_clipboard_unsupported",error:error instanceof Error?error.message:"无法安全复制所选步骤"};}
}
export function pasteProgramDocumentSteps(session:ProgramDocumentSession,surface:string,text:string,afterId:string|null,options:ProgramDocumentEditOptions):ProgramDocumentEditResult&{insertedIds?:readonly string[]}{
  let insertedIds:string[]=[];
  const result=session.transact({...options,update(document){
    parseVariableReferenceJson(session.getState().content);
    const body=readClipboardSurface(document,surface);readClipboardVariables(body);
    const reserved:string[]=[];
    const steps=(rows:ActionStep[])=>{for(const row of rows){reserved.push(row.stepId);steps(row.ifSteps);steps(row.elseSteps);}};
    const programs=(body:ReturnType<typeof session.readSnapshot>|ActionSubProgram)=>{steps(body.steps);reserved.push(...body.variables.map(row=>row.id));for(const child of body.subPrograms){reserved.push(child.id);programs(child);}};
    programs(session.readSnapshot());
    insertedIds=appendRawStepsClipboard(document,body,text,afterId,reserved);
  }});
  return result.ok?{...result,insertedIds}:result;
}
