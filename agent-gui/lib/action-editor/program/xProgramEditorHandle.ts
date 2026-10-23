import type { XProgramPresent } from "./xProgramHistory";

/** Live editor surface used by document save and undoable external changes. */
export type XProgramEditorHandle = {
  getPresent(): XProgramPresent;
  applyProgram(present: XProgramPresent, options?: { recordUndo?: boolean }): void;
  /** Flush committed-form drafts before document history or persistence reads. */
  flushPendingEdits?(): void;
};
