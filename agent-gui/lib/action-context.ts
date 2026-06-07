/** Action metadata attached as a composer tag for the current draft message only. */

export type MentionKind = "action" | "subprogram";

export type PinnedAction = {
  id: string;
  title: string;
  description?: string;
  lastEditTimeLocal?: string;
  kind?: MentionKind;
  icon?: string;
  /** sys:subprogram wire value when kind=subprogram. */
  callIdentifier?: string;
};
