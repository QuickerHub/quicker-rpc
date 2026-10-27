import { parseLosslessJson } from "../shared/losslessJson";
import { findUniqueOwnedProgramDocumentStep, isSubProgramRecord, subProgramRows, type SubProgramRecord } from "./programDocumentSubProgramModel";

/** Locate the actual raw row; a typed projection's generated ID is not identity evidence. */
export function readProgramDocumentLiveStep(content: string, stepId: string): Readonly<{
  stepId: string; surface: string; path: string; documentPath: string; runnerKey: string;
}> {
  const body: unknown = parseLosslessJson(content);
  if (!isSubProgramRecord(body)) throw Error("The original program document is not an object.");
  const selected = findUniqueOwnedProgramDocumentStep(body, stepId);
  const runners = ["stepRunnerKey", "StepRunnerKey", "key", "Key"].filter(key => Object.hasOwn(selected, key));
  if (runners.length !== 1 || typeof selected[runners[0]!] !== "string" || !(selected[runners[0]!] as string).trim())
    throw Error("The selected step has no unambiguous runner identity.");
  let found: { surface: string; path: string; documentPath: string } | undefined;
  const steps = (rows: SubProgramRecord[], surface: string, path: string, programPath: string): void => {
    rows.forEach((row, index) => {
      const current = `${path}/${index}`;
      if (row === selected) found = { surface, path: current, documentPath: programPath + current };
      steps(subProgramRows(row.ifSteps), surface, `${current}/ifSteps`, programPath);
      steps(subProgramRows(row.elseSteps), surface, `${current}/elseSteps`, programPath);
    });
  };
  const program = (row: SubProgramRecord, surface: string, programPath: string): void => {
    steps(subProgramRows(row.steps), surface, "/steps", programPath);
    for (const [index, child] of subProgramRows(row.subPrograms).entries()) {
      if (typeof child.id !== "string" || !child.id.trim()) continue;
      program(child, `sub-${child.id}`, `${programPath}/subPrograms/${index}`);
    }
  };
  program(body, "main", "");
  if (!found) throw Error("The selected step has no owned program surface.");
  return { stepId, ...found, runnerKey: selected[runners[0]!] as string };
}
