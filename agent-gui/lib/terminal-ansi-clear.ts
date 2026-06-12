/** ANSI ED (erase display / scrollback) and RIS — PowerShell cls / clear-host. */
const SCREEN_CLEAR_RE = /\x1b\[[0-9;?]*[23]J|\x1bc/g;

const REPLAY_MAX_CHARS = 256 * 1024;

export function chunkIncludesScreenClear(chunk: string): boolean {
  SCREEN_CLEAR_RE.lastIndex = 0;
  return SCREEN_CLEAR_RE.test(chunk);
}

/** Drop replay content before the last in-stream screen clear. */
export function mergeTerminalReplay(previous: string, chunk: string): string {
  const combined = `${previous}${chunk}`;
  let lastClearAt = -1;
  SCREEN_CLEAR_RE.lastIndex = 0;
  let match = SCREEN_CLEAR_RE.exec(combined);
  while (match) {
    lastClearAt = match.index;
    match = SCREEN_CLEAR_RE.exec(combined);
  }
  const next = lastClearAt >= 0 ? combined.slice(lastClearAt) : combined;
  if (next.length <= REPLAY_MAX_CHARS) return next;
  return next.slice(-REPLAY_MAX_CHARS);
}
