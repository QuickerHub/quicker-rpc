export type WorkFoldOpenOverride = boolean | null;

/** Explicit reading choices survive live/default state changes. */
export function resolveWorkFoldOpen(
  defaultOpen: boolean,
  openOverride: WorkFoldOpenOverride,
): boolean {
  return openOverride ?? defaultOpen;
}

export type WorkFoldScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export const WORK_FOLD_FOLLOW_ENTER_PX = 64;
export const WORK_FOLD_FOLLOW_EXIT_PX = 8;

/** At the tail, End/downward wheel may express intent without producing scroll. */
export function workFoldFollowingOnTailIntent(
  following: boolean,
  { scrollHeight, scrollTop, clientHeight }: WorkFoldScrollMetrics,
): boolean {
  return following || scrollHeight - scrollTop - clientHeight <= 1;
}

/** V2's asymmetric thresholds let readers leave the tail before the next chunk. */
export function nextWorkFoldFollowing(
  following: boolean,
  { scrollHeight, scrollTop, clientHeight }: WorkFoldScrollMetrics,
  previous?: WorkFoldScrollMetrics,
  towardTail = false,
): boolean {
  const distance = scrollHeight - scrollTop - clientHeight;
  if (following) return distance <= WORK_FOLD_FOLLOW_EXIT_PX;
  // Repeated samples and browser scroll anchoring are not a request to resume.
  if (!previous || scrollTop <= previous.scrollTop + 0.5
    || scrollHeight !== previous.scrollHeight || clientHeight !== previous.clientHeight) return false;
  return distance <= 1 || (towardTail && distance <= WORK_FOLD_FOLLOW_ENTER_PX);
}
