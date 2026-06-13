import type { ActionMentionItem } from "@/lib/action-mention-items";
import type {
  DesignerContextSnapshot,
  DesignerSelectedStep,
  DesignerWindowContext,
} from "@/lib/designer-context-types";

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesQuery(text: string | undefined, query: string): boolean {
  if (!query) return true;
  const hay = (text ?? "").trim().toLowerCase();
  return hay.includes(query);
}

function stepMatchesQuery(step: DesignerSelectedStep, query: string): boolean {
  if (!query) return true;
  const indexText = `步骤 ${step.index + 1}`;
  return (
    matchesQuery(indexText, query)
    || matchesQuery(step.note, query)
    || matchesQuery(step.stepRunnerKey, query)
    || matchesQuery(step.stepId, query)
  );
}

export function formatDesignerStepMentionTitle(step: DesignerSelectedStep): string {
  const indexLabel = `步骤 ${step.index + 1}`;
  const note = step.note?.trim();
  if (note) return `${indexLabel}: ${note}`;
  const runner = step.stepRunnerKey?.trim();
  if (runner) return `${indexLabel}: ${runner}`;
  return indexLabel;
}

function stepMentionId(entityId: string, step: DesignerSelectedStep): string {
  const stepId = step.stepId?.trim();
  if (stepId) return stepId;
  return `${entityId}#step-${step.index}`;
}

function resolveDesignerWindow(
  snapshot: DesignerContextSnapshot | null,
  entityId: string,
): DesignerWindowContext | null {
  if (!snapshot?.ok || snapshot.designers.length === 0) return null;
  const normalized = entityId.trim().toLowerCase();
  const exact = snapshot.designers.find(
    (d) => (d.entityId ?? "").trim().toLowerCase() === normalized,
  );
  if (exact) return exact;
  const active = snapshot.designers.find((d) => d.isActive);
  if (active) return active;
  return snapshot.designers[0] ?? null;
}

/** Pinned rows shown at the top of @-mention when embedded in ActionDesigner. */
export function buildDesignerMentionItems(
  snapshot: DesignerContextSnapshot | null,
  entityId: string,
  isSubProgram: boolean,
  query: string,
  maxItems = 8,
): ActionMentionItem[] {
  const designer = resolveDesignerWindow(snapshot, entityId);
  if (!designer?.entityId?.trim()) return [];

  const q = normalizeQuery(query);
  const actionId = designer.entityId.trim();
  const title = designer.title?.trim() || "(当前动作)";
  const items: ActionMentionItem[] = [];

  const actionMatches =
    !q
    || matchesQuery(title, q)
    || matchesQuery(actionId, q)
    || matchesQuery("当前", q)
    || matchesQuery("编辑", q);

  if (actionMatches) {
    items.push({
      kind: isSubProgram || designer.isSubProgram ? "subprogram" : "action",
      id: actionId,
      title,
      designerPin: true,
      score: 10_000,
    });
  }

  for (const step of designer.selectedSteps ?? []) {
    if (!stepMatchesQuery(step, q)) continue;
    items.push({
      kind: "designer-step",
      id: stepMentionId(actionId, step),
      title: formatDesignerStepMentionTitle(step),
      entityId: actionId,
      isSubProgram: isSubProgram || designer.isSubProgram,
      stepIndex: step.index,
      stepId: step.stepId?.trim() || undefined,
      stepRunnerKey: step.stepRunnerKey?.trim() || undefined,
      score: 9_000 - step.index,
    });
  }

  return items.slice(0, maxItems);
}

function mentionItemKey(item: ActionMentionItem): string {
  const kind = item.kind ?? "action";
  if (kind === "designer-step") {
    return `designer-step:${item.entityId ?? item.id}:${item.stepIndex ?? -1}:${item.id}`;
  }
  return `${kind}:${item.id}`;
}

/** Prepend designer pins; dedupe remote search hits against the current action id. */
export function mergeDesignerMentionItems(
  designerItems: ActionMentionItem[],
  searchItems: ActionMentionItem[],
  currentEntityId: string,
  limit = 8,
): ActionMentionItem[] {
  const merged: ActionMentionItem[] = [];
  const seen = new Set<string>();
  const normalizedEntity = currentEntityId.trim().toLowerCase();

  for (const item of designerItems) {
    const key = mentionItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  for (const item of searchItems) {
    if (merged.length >= limit) break;
    const key = mentionItemKey(item);
    if (seen.has(key)) continue;
    if (
      normalizedEntity
      && (item.kind === "action" || item.kind === "subprogram" || !item.kind)
      && item.id.trim().toLowerCase() === normalizedEntity
    ) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, limit);
}
