export type StepListEditorSession = {
  selectedId: string;
  selectedIds: string[];
  selectionAnchorId: string;
};

const sessions = new Map<string, StepListEditorSession>();

function normalizeDocumentKey(programDocumentKey: string | undefined): string {
  return (programDocumentKey ?? "").trim();
}

export function getStepListEditorSession(
  programDocumentKey: string | undefined,
): StepListEditorSession | undefined {
  const key = normalizeDocumentKey(programDocumentKey);
  if (!key) {
    return undefined;
  }
  return sessions.get(key);
}

export function setStepListEditorSession(
  programDocumentKey: string | undefined,
  session: StepListEditorSession,
): void {
  const key = normalizeDocumentKey(programDocumentKey);
  if (!key) {
    return;
  }
  sessions.set(key, {
    selectedId: session.selectedId,
    selectedIds: [...session.selectedIds],
    selectionAnchorId: session.selectionAnchorId,
  });
}

function isStepIdValid(stepIds: readonly string[], id: string): boolean {
  return Boolean(id) && stepIds.includes(id);
}

/** Restore multi-select from session cache, or fall back to the first step. */
export function resolveStepListInitialSelection(
  programDocumentKey: string | undefined,
  stepIds: readonly string[],
): StepListEditorSession {
  const cached = getStepListEditorSession(programDocumentKey);
  if (cached) {
    const validIds = cached.selectedIds.filter((id) => isStepIdValid(stepIds, id));
    if (validIds.length > 0) {
      const selectedId = isStepIdValid(stepIds, cached.selectedId)
        ? cached.selectedId
        : validIds[validIds.length - 1]!;
      const selectionAnchorId = isStepIdValid(stepIds, cached.selectionAnchorId)
        ? cached.selectionAnchorId
        : selectedId;
      return { selectedId, selectedIds: validIds, selectionAnchorId };
    }
    if (isStepIdValid(stepIds, cached.selectedId)) {
      return {
        selectedId: cached.selectedId,
        selectedIds: [cached.selectedId],
        selectionAnchorId: cached.selectionAnchorId || cached.selectedId,
      };
    }
  }

  const defaultId = stepIds[0] ?? "";
  return {
    selectedId: defaultId,
    selectedIds: defaultId ? [defaultId] : [],
    selectionAnchorId: defaultId,
  };
}
