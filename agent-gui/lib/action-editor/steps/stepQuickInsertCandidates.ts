import type { ActionStep, ActionSubProgram } from "@/lib/action-editor/types/common";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { formatSubProgramIdentifier } from "./subProgramStepIdentifier";
import { buildStepFromRunner, type ToolboxDragPayload } from "./toolboxStepFactory";

export type QuickInsertCandidate =
  | {
      kind: "runner";
      id: string;
      label: string;
      /** Server-built HTML (escaped + &lt;mark&gt;); omit for local catalog rows. */
      labelHtml?: string;
      description: string;
      descriptionHtml?: string;
      searchHaystack: string;
      payload: ToolboxDragPayload;
    }
  | {
      kind: "subprogram";
      id: string;
      label: string;
      labelHtml?: string;
      description: string;
      descriptionHtml?: string;
      searchHaystack: string;
      subProgramIdentifier: string;
    };

export function buildQuickInsertCandidates(
  runnerItems: StepRunnerItem[],
  subPrograms: ActionSubProgram[]
): QuickInsertCandidate[] {
  const parentKeys = new Set(runnerItems.map((it) => (it.key ?? "").trim()).filter(Boolean));
  const out: QuickInsertCandidate[] = [];

  for (const it of runnerItems) {
    const pk = (it.key ?? "").trim();
    if (!pk) continue;
    const parentLabel = (it.name ?? "").trim() || pk;
    const parentDesc = (it.description ?? "").trim();
    out.push({
      kind: "runner",
      id: `r:${pk}`,
      label: parentLabel,
      description: parentDesc,
      searchHaystack: `${pk} ${parentLabel} ${parentDesc}`.toLowerCase(),
      payload: { stepRunnerKey: pk, name: parentLabel, icon: (it.icon ?? "").trim() || undefined }
    });
    for (const sub of it.subItems ?? []) {
      const sk = (sub.key ?? "").trim();
      if (!sk) continue;
      const subName = (sub.name ?? "").trim() || sk;
      const subDesc = (sub.description ?? "").trim() || parentDesc;
      const isPeerRunner =
        runnerItems.length > 0 ? runnerItems.some((x) => (x.key ?? "").trim() === sk) : parentKeys.has(sk);
      const payload: ToolboxDragPayload = isPeerRunner
        ? { stepRunnerKey: sk, name: subName, icon: (it.icon ?? "").trim() || undefined }
        : { stepRunnerKey: pk, name: subName, icon: (it.icon ?? "").trim() || undefined, controlFieldValue: sk };
      out.push({
        kind: "runner",
        id: `r:${pk}:${sk}`,
        label: isPeerRunner ? subName : `${parentLabel} › ${subName}`,
        description: subDesc,
        searchHaystack: `${pk} ${sk} ${subName} ${subDesc} ${parentLabel}`.toLowerCase(),
        payload
      });
    }
  }

  const seenSp = new Set<string>();
  for (const sp of subPrograms) {
    const ident = formatSubProgramIdentifier(sp);
    const key = `${sp.id}:${ident}`;
    if (seenSp.has(key)) continue;
    seenSp.add(key);
    const label = (sp.name ?? "").trim() || ident;
    const desc = (sp.description ?? "").trim();
    out.push({
      kind: "subprogram",
      id: `sp:${sp.id}`,
      label: `子程序: ${label}`,
      description: desc,
      searchHaystack: `子程序 subprogram ${ident} ${label} ${desc} ${sp.id}`.toLowerCase(),
      subProgramIdentifier: ident
    });
  }
  return out;
}

export function filterQuickInsertCandidates(all: QuickInsertCandidate[], query: string): QuickInsertCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return all;
  }
  return all.filter((c) => c.searchHaystack.includes(q));
}

export function quickInsertCandidateToStep(
  candidate: QuickInsertCandidate,
  runnerItems: StepRunnerItem[],
  createStepId: () => string
): ActionStep {
  if (candidate.kind === "runner") {
    return buildStepFromRunner(candidate.payload, runnerItems, createStepId);
  }
  return buildStepFromRunner(
    { stepRunnerKey: "sys:subprogram", subProgramIdentifier: candidate.subProgramIdentifier },
    runnerItems,
    createStepId
  );
}
