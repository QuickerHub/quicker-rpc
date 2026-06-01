/** Action metadata attached as a composer tag for the current draft message only. */

export type PinnedAction = {
  id: string;
  title: string;
  description?: string;
  lastEditTimeLocal?: string;
};
