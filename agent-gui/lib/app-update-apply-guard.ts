/** Prevents duplicate apply-and-exit / close-handler install triggers in one session. */
let applyStarted = false;

export function tryBeginAppUpdateApply(): boolean {
  if (applyStarted) return false;
  applyStarted = true;
  return true;
}

export function isAppUpdateApplyStarted(): boolean {
  return applyStarted;
}
