/** Action metadata attached as a composer tag for the current draft message only. */

export type MentionKind = "action" | "subprogram" | "designer-step";

export type PinnedAction = {
  id: string;
  title: string;
  description?: string;
  lastEditTimeLocal?: string;
  kind?: MentionKind;
  icon?: string;
  /** sys:subprogram wire value when kind=subprogram. */
  callIdentifier?: string;
  /** Parent action/subprogram id when kind=designer-step. */
  entityId?: string;
  isSubProgram?: boolean;
  stepIndex?: number;
  stepId?: string;
  stepRunnerKey?: string;
  /** Mention picker only: pin the action currently open in ActionDesigner. */
  designerPin?: boolean;
};
