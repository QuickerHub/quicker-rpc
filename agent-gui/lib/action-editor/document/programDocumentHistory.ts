import type { ProgramDocumentMetadata, ProgramDocumentMetadataPatch } from "./programDocumentMetadata";

/** Matches the migrated program editor's existing bounded timeline. */
export const PROGRAM_DOCUMENT_HISTORY_MAX = 80;

export type ProgramDocumentHistorySnapshot = Readonly<{
  content: string;
  /** Editable values only: undo must never restore a host version or metadata extension. */
  metadata?: Readonly<ProgramDocumentMetadata>;
}>;

export type ProgramDocumentHistoryState = Readonly<{
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}>;

function snapshot(value: ProgramDocumentHistorySnapshot): ProgramDocumentHistorySnapshot {
  return Object.freeze({ content: value.content,
    ...(value.metadata ? { metadata: Object.freeze({ ...value.metadata }) } : {}),
  });
}

/** Before-images only. The document session remains the sole owner of the present draft. */
export function createProgramDocumentHistory() {
  let past: ProgramDocumentHistorySnapshot[] = [];
  let future: ProgramDocumentHistorySnapshot[] = [];
  let availability: ProgramDocumentHistoryState = Object.freeze({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  const updateAvailability = () => {
    if (availability.undoDepth === past.length && availability.redoDepth === future.length) return;
    availability = Object.freeze({ canUndo: past.length > 0, canRedo: future.length > 0, undoDepth: past.length, redoDepth: future.length });
  };
  const move = (direction: "undo" | "redo", present: ProgramDocumentHistorySnapshot,
    equivalent: (candidate: ProgramDocumentHistorySnapshot) => boolean): ProgramDocumentHistorySnapshot | undefined => {
    const from = direction === "undo" ? past : future;
    const to = direction === "undo" ? future : past;
    while (from.length > 0) {
      const candidate = from[from.length - 1]!;
      if (equivalent(candidate)) { from.pop(); continue; }
      from.pop();
      to.push(snapshot(present));
      if (to.length > PROGRAM_DOCUMENT_HISTORY_MAX) to.shift();
      updateAvailability();
      return candidate;
    }
    updateAvailability();
    return undefined;
  };
  return {
    getState: (): ProgramDocumentHistoryState => availability,
    record(before: ProgramDocumentHistorySnapshot): void {
      past.push(snapshot(before));
      if (past.length > PROGRAM_DOCUMENT_HISTORY_MAX) past.shift();
      future = [];
      updateAvailability();
    },
    undo: (present: ProgramDocumentHistorySnapshot, equivalent: (candidate: ProgramDocumentHistorySnapshot) => boolean) => move("undo", present, equivalent),
    redo: (present: ProgramDocumentHistorySnapshot, equivalent: (candidate: ProgramDocumentHistorySnapshot) => boolean) => move("redo", present, equivalent),
    /** Accepted external fields are not local undo operations. Retain unrelated body/property edits. */
    rebaseMetadata(patch: ProgramDocumentMetadataPatch): void {
      const rebase = (entry: ProgramDocumentHistorySnapshot) => entry.metadata
        ? snapshot({ content: entry.content, metadata: { ...entry.metadata, ...patch } }) : entry;
      past = past.map(rebase);
      future = future.map(rebase);
    },
    clear(): void { past = []; future = []; updateAvailability(); },
  };
}
