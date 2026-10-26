import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramDocumentSession } from "./programDocumentSession";
import { createProgramDocumentEditorController } from "../program/programDocumentEditorController";
import { parseStepClipboardBody } from "../program/programStepClipboardCodec";

const body='{"steps":[{"stepId":"branch","stepRunnerKey":"sys:if","inputParams":{"condition":{"value":"$=true","future":9223372036854775807}},"ifSteps":[{"stepId":"child","stepRunnerKey":"sys:comment","inputParams":{"note.var":"中文"},"future":1.0000000000000001}],"elseSteps":[{"stepId":"other","stepRunnerKey":"sys:comment","note":"else"}],"future":{"wide":9007199254740993}},{"stepId":"anchor","stepRunnerKey":"sys:comment","note":"anchor"}],"variables":[{"id":"v1","key":"中文","varType":0,"defaultValue":"$$依赖={依赖}","future":1e999},{"id":"v2","key":"依赖","varType":0,"defaultValue":"text"},{"id":"unused","key":"unused","default.file":"files/unused"}],"subPrograms":[],"future":0.1234567890123456789}';
function fixture(content=body){
  const session=createProgramDocumentSession({content,identity:{documentKey:"steps-clipboard"}});let current=true;
  const controller=createProgramDocumentEditorController(session,{isCurrent:()=>current,onChange:()=>{}});
  return {session,controller,main:controller.getSurface("main"),leave:()=>{current=false;}};
}
test("selected raw branches and variable closure preserve metadata/numbers in one current Session undo",()=>{
  const {session,controller,main}=fixture();const original=session.getState();
  const copy=main.exportSteps!(["child","branch"]);assert.ok(copy.ok,copy.ok?"":copy.error);
  const parsed=parseStepClipboardBody(copy.text);assert.equal(parsed.steps.length,1);assert.deepEqual(parsed.variables.map(row=>row.key),["中文","依赖"]);
  assert.match(copy.text,/9223372036854775807/);assert.match(copy.text,/1\.0000000000000001/);assert.match(copy.text,/1e999/);assert.equal(session.getState(),original);
  assert.equal(session.transact({expectedRevision:0,source:"agent",update(document){(document.steps as {note?:string}[])[1]!.note="concurrent edit";}}).ok,true);
  const before=session.getState();const pasted=main.pasteSteps!(copy.text,"anchor");assert.ok(pasted.ok,pasted.ok?"":pasted.error);
  const snapshot=controller.getSnapshot();assert.equal(snapshot.steps.length,3);assert.equal(snapshot.steps[1]!.note,"concurrent edit");
  assert.deepEqual(snapshot.variables.map(row=>row.key),["中文","依赖","unused","中文_copy","依赖_copy"]);
  assert.equal(snapshot.steps[2]!.ifSteps[0]!.inputParams.note!.varKey,"中文_copy");
  assert.equal(snapshot.variables[3]!.defaultValue,"$$依赖={依赖_copy}");
  const ids=snapshot.steps.flatMap(step=>[step.stepId,...step.ifSteps.map(child=>child.stepId),...step.elseSteps.map(child=>child.stepId)]);assert.equal(new Set(ids).size,ids.length);
  assert.match(session.getState().content,/9007199254740993/);assert.match(session.getState().content,/0\.1234567890123456789/);
  controller.undo();assert.equal(session.getState().content,before.content);controller.redo();assert.equal(controller.getSnapshot().steps.length,3);
});

const calls='{"steps":[{"stepId":"call","stepRunnerKey":"sys:subprogram","inputParams":{"subProgram":{"value":"worker"},"var:input":{"varKey":"caller"}},"outputParams":{"var:output":"caller"}}],"variables":[{"id":"caller","key":"caller","varType":0,"defaultValue":"x"}],"subPrograms":[{"id":"worker-id","name":"worker","kind":1,"future":9223372036854775807,"steps":[{"stepId":"inside","stepRunnerKey":"sys:comment","inputParams":{"note":{"varKey":"input"}},"outputParams":{"value":"output"}}],"variables":[{"id":"input","key":"input","varType":0,"isInput":true,"inputParamInfo":{"visibleExpression":"$=true","future":1e999}},{"id":"output","key":"output","varType":0,"isOutput":true},{"id":"unused","key":"not_used","default.file":"files/not-needed"}],"subPrograms":[]},{"id":"foreign","name":"foreign","kind":2,"steps":[],"variables":[]}]}';
test("internal program closure remaps caller values and callee interface labels as separate namespaces",()=>{
  const {session,main,controller}=fixture(calls);const copy=main.exportSteps!(["call"]);assert.ok(copy.ok,copy.ok?"":copy.error);
  const payload=parseStepClipboardBody(copy.text);assert.equal(payload.subPrograms.length,1);assert.deepEqual((payload.subPrograms[0]!.variables as {key:string}[]).map(row=>row.key),["input","output"]);
  const pasted=main.pasteSteps!(copy.text,"call");assert.ok(pasted.ok,pasted.ok?"":pasted.error);
  const snapshot=controller.getSnapshot(),step=snapshot.steps[1]!,program=snapshot.subPrograms[2]!;
  assert.equal(program.name,"worker_copy");assert.equal(step.inputParams.subProgram!.value,'$="worker_copy"');
  assert.equal(step.inputParams['var:input_copy']!.varKey,"caller_copy");assert.equal(step.outputParams['var:output_copy'],"caller_copy");
  assert.equal(program.steps[0]!.inputParams.note!.varKey,"input_copy");assert.equal(program.steps[0]!.outputParams.value,"output_copy");
  assert.match(session.getState().content,/9223372036854775807/);assert.match(session.getState().content,/1e999/);
  controller.undo();assert.equal(session.getState().content,calls);
});

test("unsupported file, dynamic, callback, shadow, ambiguous and departed inputs never partially mutate",()=>{
  const source=fixture(),copy=source.main.exportSteps!(["branch"]);assert.ok(copy.ok);
  for(const text of [copy.text.replace('"sys:if"','"custom:unknown"'),copy.text.replace('"Value": "$=true"','"file":"files/a"'),
    copy.text.replace('"Value": "$=true"','"Value":"$=DoSomething()"'),copy.text.replace('"Steps": [','"steps":[],"Steps":['),
    calls.replace('"value":"worker"','"value":"%%shared"'),calls.replace('"value":"worker"','"varKey":"caller"'),
    calls.replace('"var:input"','"input"'),calls.replace('"kind":2','"kind":1').replace('"name":"foreign"','"name":"worker"')]){
    const {session,main}=fixture();const before=session.getState();assert.equal(main.pasteSteps!(text,"anchor").ok,false,text);assert.equal(session.getState(),before);
  }
  const left=fixture();left.leave();assert.equal(left.main.exportSteps!(["branch"]).ok,false);assert.equal(left.main.pasteSteps!(copy.text,"anchor").ok,false);
});

test("whole-batch variable names and IDs are reserved at commit without sequential rename collisions",()=>{
  const source=fixture('{"steps":[{"stepId":"selected","stepRunnerKey":"sys:comment","inputParams":{"note":{"value":"$$ {a} {a_copy}"}}}],"variables":[{"id":"a","key":"a","defaultValue":"text"},{"id":"b","key":"a_copy","defaultValue":"text"}],"subPrograms":[]}');
  const copy=source.main.exportSteps!(["selected"]);assert.ok(copy.ok);
  const target=fixture('{"steps":[{"stepId":"s-clipboard-1","stepRunnerKey":"sys:comment"}],"variables":[{"id":"v-clipboard-1","key":"A_COPY"}],"subPrograms":[]}');
  const result=target.main.pasteSteps!(copy.text,"s-clipboard-1");assert.ok(result.ok,result.ok?"":result.error);
  const snapshot=target.controller.getSnapshot();assert.deepEqual(snapshot.variables.map(row=>row.key),["A_COPY","a_copy_2","a_copy_copy"]);
  assert.equal(snapshot.steps[1]!.inputParams.note!.value,"$$ {a_copy_2} {a_copy_copy}");
  assert.equal(new Set(snapshot.variables.map(row=>row.id)).size,3);
});

test("unrelated files and unsupported bodies do not expand the selected dependency closure",()=>{
  const value=body.replace('"note":"anchor"','"note":"anchor","inputParams":{"script.file":"files/unrelated"}')
    .replace('"subPrograms":[]','"subPrograms":[{"id":"unrelated","name":"Unrelated","kind":2,"steps":[{"stepRunnerKey":"custom:unknown","inputParams":{"code.file":"files/foreign"}}],"variables":[]}]');
  const {session,main}=fixture(value),before=session.getState();const copy=main.exportSteps!(["branch"]);assert.ok(copy.ok,copy.ok?"":copy.error);
  const dto=parseStepClipboardBody(copy.text);assert.equal(dto.subPrograms.length,0);assert.equal(dto.variables.length,2);assert.equal(session.getState(),before);
});

test("ambiguous case aliases and opaque Unicode reference carriers refuse the whole batch",()=>{
  const source=fixture();const copy=source.main.exportSteps!(["branch"]);assert.ok(copy.ok);
  for(const text of [copy.text.replace('"Value": "$=true"','"Value":"$=true","VALUE":"$=false"'),
    copy.text.replace('"IfSteps": [','"IFSTEPS":[],"IfSteps":['),copy.text.replace('"StepId": "branch"','"STEPID":"other","StepId":"branch"'),
    copy.text.replace('"Variables": [','"VARIABLES":[],"Variables":['),copy.text.replace('"Type": 0','"Type":0,"TYPE":1')]){
    const f=fixture(),before=f.session.getState();assert.equal(f.main.pasteSteps!(text,"anchor").ok,false);assert.equal(f.session.getState(),before);
  }
  for(const key of ['@class','值\u0301'])for(const location of ['step','pin']){
    const value={steps:[{stepId:'one',stepRunnerKey:'sys:comment',inputParams:{note:{varKey:key,...(location==='pin'?{future:`{${key}}`}:{})}},...(location==='step'?{future:`{${key}}`}:{})}],variables:[{id:'v',key,varType:0}],subPrograms:[]};
    const f=fixture(JSON.stringify(value)),before=f.session.getState();assert.equal(f.main.exportSteps!(['one']).ok,false);assert.equal(f.session.getState(),before);
  }
});

test("unprefixed native eval expressions, simpleIf and exact runtime pseudo inputs retain their meanings",()=>{
  const content=JSON.stringify({steps:[{stepId:'expression',stepRunnerKey:'sys:evalexpression',inputParams:{expression:{value:'context.GetVarValue("中文")'}}},
    {stepId:'conditional',stepRunnerKey:'sys:simpleIf',inputParams:{condition:{value:'$=true'}},ifSteps:[{stepId:'builtin',stepRunnerKey:'sys:comment',inputParams:{note:{varKey:'[cliptext]'},message:{value:'$$ {[cliptext]} {quicker_in_param}'}}}]}],variables:[{id:'local',key:'中文',varType:0}],subPrograms:[]});
  const f=fixture(content),copy=f.main.exportSteps!(['expression','conditional']);assert.ok(copy.ok,copy.ok?'':copy.error);assert.equal(parseStepClipboardBody(copy.text).variables.length,1);
  const result=f.main.pasteSteps!(copy.text,'conditional');assert.ok(result.ok,result.ok?'':result.error);
  const snapshot=f.controller.getSnapshot();assert.equal(snapshot.steps[2]!.inputParams.expression!.value,'context.GetVarValue("中文_copy")');
  assert.equal(snapshot.steps[3]!.ifSteps[0]!.inputParams.note!.varKey,'[cliptext]');assert.equal(snapshot.variables.length,2);
});

test("dynamic interpolation and generic, indirect or subprogram expression calls remain unsupported",()=>{
  for(const value of ['$$ {items[index]}','$$ {count+1=}','$=Unknown<int>()','$=Namespace.Helper.Read<string>()','$=((Func<int>)(()=>1))()','context.RunSp("worker", null)']){
    const f=fixture(JSON.stringify({steps:[{stepId:'one',stepRunnerKey:'sys:evalexpression',inputParams:{expression:{value}}}],variables:[{id:'list',key:'items',varType:3},{id:'index',key:'index',varType:1},{id:'count',key:'count',varType:1}],subPrograms:[]})),before=f.session.getState();
    assert.equal(f.main.exportSteps!(['one']).ok,false,value);assert.equal(f.session.getState(),before);
  }
});

test("legacy ID-less anchors explicitly refuse asynchronous positioning while append reserves projected IDs",()=>{
  const f=fixture(body.replace(/"stepId":"[^"]+",/g,''));const id=f.main.getPresent().steps[0]!.stepId;
  const copy=f.main.exportSteps!([id]);assert.ok(copy.ok,copy.ok?'':copy.error);const before=f.session.getState();
  const denied=f.main.pasteSteps!(copy.text,id);assert.equal(denied.ok,false);if(!denied.ok)assert.match(denied.error,/稳定原文身份/);assert.equal(f.session.getState(),before);
  const appended=f.main.pasteSteps!(copy.text,null);assert.ok(appended.ok,appended.ok?'':appended.error);
  const roots=f.main.getPresent().steps;assert.equal(new Set(roots.map(row=>row.stepId)).size,roots.length);
});

test("native unprefixed interface visibility is analysed rather than silently retaining old interface names",()=>{
  const value=JSON.parse(calls);value.subPrograms[0].variables[0].inputParamInfo.visibleExpression='input == "x"';
  const f=fixture(JSON.stringify(value)),before=f.session.getState();assert.equal(f.main.exportSteps!(['call']).ok,false);assert.equal(f.session.getState(),before);
  value.subPrograms[0].variables[0].inputParamInfo.visibleExpression='true';
  const allowed=fixture(JSON.stringify(value));const copy=allowed.main.exportSteps!(['call']);assert.ok(copy.ok,copy.ok?'':copy.error);
  const pasted=allowed.main.pasteSteps!(copy.text,'call');assert.ok(pasted.ok,pasted.ok?'':pasted.error);
  assert.equal(allowed.controller.getSnapshot().subPrograms.at(-1)!.variables[0]!.inputParamInfo!.visibleExpression,'true');
  for(const [key,expression] of [['selectionItems','$=context.GetVarValue("hidden")'],['future','{count+1=}']]){
    const candidate=structuredClone(value);candidate.subPrograms[0].variables[0].inputParamInfo[key!]=expression;
    const opaque=fixture(JSON.stringify(candidate)),before=opaque.session.getState();assert.equal(opaque.main.exportSteps!(['call']).ok,false);assert.equal(opaque.session.getState(),before);
  }
});

test("absent and null maps and pins survive raw clipboard transactions without generated defaults",()=>{
  const content='{"steps":[{"stepId":"absent","stepRunnerKey":"sys:comment"},{"stepId":"null","stepRunnerKey":"sys:comment","inputParams":null,"outputParams":null},{"stepId":"pins","stepRunnerKey":"sys:comment","inputParams":{"note":null},"outputParams":{"result":null}}],"variables":[],"subPrograms":[]}';
  const f=fixture(content),copy=f.main.exportSteps!(['absent','null','pins']);assert.ok(copy.ok,copy.ok?'':copy.error);
  const pasted=f.main.pasteSteps!(copy.text,'pins');assert.ok(pasted.ok,pasted.ok?'':pasted.error);
  const raw=JSON.parse(f.session.getState().content).steps;assert.equal(Object.hasOwn(raw[3],'inputParams'),false);assert.equal(raw[4].inputParams,null);assert.equal(raw[5].inputParams.note,null);assert.equal(raw[5].outputParams.result,null);
  const before=f.session.getState();assert.equal(f.main.pasteSteps!(copy.text.replace('"StepId": "null"','"StepId":"null","IfSteps":null'),'pins').ok,false);assert.equal(f.session.getState(),before);
});

test("opaque step and pin expression markers refuse the batch without a Session commit",()=>{
  for(const carrier of ['step','pin'])for(const marker of ['{count+1=}','{count']){
    const step={stepId:'one',stepRunnerKey:'sys:comment',inputParams:{note:{varKey:'count',...(carrier==='pin'?{future:marker}:{})}},...(carrier==='step'?{future:marker}:{})};
    const content=JSON.stringify({steps:[step],variables:[{id:'count',key:'count',varType:1,defaultValue:'1'}],subPrograms:[]});
    const f=fixture(content),before=f.session.getState();
    assert.equal(f.main.exportSteps!(['one']).ok,false,`${carrier}: ${marker}`);assert.equal(f.session.getState(),before);
    assert.equal(f.main.pasteSteps!(content,'one').ok,false);assert.equal(f.session.getState(),before);assert.equal(f.session.getState().revision,0);
    const plain=content.replaceAll(marker,'plain opaque metadata');const allowed=fixture(plain),copy=allowed.main.exportSteps!(['one']);assert.ok(copy.ok,copy.ok?'':copy.error);
    const payload=parseStepClipboardBody(copy.text),raw=payload.steps[0]!;
    assert.equal(carrier==='step'?raw.future:(raw.inputParams as Record<string,{future:string}>).note!.future,'plain opaque metadata');
    const pasted=allowed.main.pasteSteps!(copy.text,'one');assert.ok(pasted.ok,pasted.ok?'':pasted.error);
    const inserted=JSON.parse(allowed.session.getState().content).steps[1];assert.equal(carrier==='step'?inserted.future:inserted.inputParams.note.future,'plain opaque metadata');
  }
});
