import { isInternalSubProgramRecord, isSubProgramRecord, type SubProgramRecord } from "../document/programDocumentSubProgramModel";
import { parseLosslessJson } from "../shared/losslessJson";
import { programDocumentFingerprint } from "../document/programDocumentWire";
import { computeNestedProgramStepDiskSlice, computeProgramStepDiskSlice, type ProgramStepDiskSlice } from "./stepDiskSlice";

export type ProgramDocumentStepPinResult = {
  ok: true; stepId: string; stepRunnerKey: string; note?: string; slice: ProgramStepDiskSlice;
} | { ok: false; error: string };

function rows(record: SubProgramRecord, key: string): SubProgramRecord[] {
  if (record[key] === undefined) return [];
  if (!Array.isArray(record[key]) || record[key].some((row) => !isSubProgramRecord(row))) {
    throw new Error(`无法定位步骤：${key} 不是有效的对象数组`);
  }
  return record[key] as SubProgramRecord[];
}

/** Uses the current root body; the existing private owner/step pin remains the authority. */
export function resolveProgramDocumentStepPin(content: string, stepId: string): ProgramDocumentStepPinResult {
  if (!stepId.trim() || stepId !== stepId.trim()) return { ok: false, error: "步骤标识无效" };
  try {
    const root: unknown = parseLosslessJson(content);
    if (!isSubProgramRecord(root)) throw new Error("data.json 根节点不是对象");
    const matches: { step: SubProgramRecord; path: string; owned: boolean }[] = [];
    const visitSteps = (steps: SubProgramRecord[], prefix: string, owned: boolean, nested: boolean): void => {
      steps.forEach((step, index) => {
        const path = prefix + index;
        if (step.stepId === stepId) matches.push({ step, path, owned });
        visitSteps(rows(step, "ifSteps"), `${path}/${nested ? "ifSteps" : "if"}/`, owned, nested);
        visitSteps(rows(step, "elseSteps"), `${path}/${nested ? "elseSteps" : "else"}/`, owned, nested);
      });
    };
    const visitPrograms = (program: SubProgramRecord, prefix: string, owned: boolean): void => {
      rows(program, "subPrograms").forEach((row, index) => {
        const path = `${prefix}subPrograms/${index}/`;
        const childOwned = owned && isInternalSubProgramRecord(row);
        visitSteps(rows(row, "steps"), `${path}steps/`, childOwned, true);
        visitPrograms(row, path, childOwned);
      });
    };
    visitSteps(rows(root, "steps"), "", true, false);
    // Foreign caches still count for ambiguity, but can never grant an editable pin.
    visitPrograms(root, "", true);
    if (matches.length === 0) return { ok: false, error: "未找到选中的步骤，可能已删除或不属于当前文档" };
    if (matches.length !== 1) return { ok: false, error: "步骤标识在当前文档中不唯一，无法加入对话" };
    const { step, path, owned } = matches[0]!;
    if (!owned) return { ok: false, error: "只能将当前文档拥有的内部子程序步骤加入对话" };
    if (Object.keys(step).filter((key) => key.toLowerCase() === "stepid").length !== 1) {
      return { ok: false, error: "步骤标识字段存在歧义，无法加入对话" };
    }
    if (typeof step.stepRunnerKey !== "string") return { ok: false, error: "步骤模块标识不可用" };
    const sliced = path.startsWith("subPrograms/")
      ? computeNestedProgramStepDiskSlice(content, path) : computeProgramStepDiskSlice(content, path);
    if (!sliced.ok) return sliced;
    if (programDocumentFingerprint(parseLosslessJson(sliced.slice.content)) !== programDocumentFingerprint(step)) {
      return { ok: false, error: "步骤切片与当前文档不一致，无法加入对话" };
    }
    return { ok: true, stepId, stepRunnerKey: step.stepRunnerKey,
      ...(typeof step.note === "string" ? { note: step.note } : {}), slice: sliced.slice };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
