"use client";
import type { TraceRunOwner } from "./action-trace-owner";
import { sameTraceRunOwner } from "./action-trace-owner";
import type { TraceViewLease } from "./action-trace-overlay";
import { consumeActionTraceSse } from "./action-trace-sse";
type Feed = {
  abort: AbortController;
  waiters: number;
  owner: TraceRunOwner;
};
const activeFeeds = new Map<string, Feed>();
/** Sharing observation does not share execution or let one waiter stop another. */
export function startActionTraceFeed(owner: TraceRunOwner, view: TraceViewLease): () => void {
  if (!view.isCurrent() || !view.owner || !sameTraceRunOwner(view.owner, owner))
    return () => { };
  let feed = activeFeeds.get(view.tabId);
  if (feed && !sameTraceRunOwner(feed.owner, owner))
    return () => { };
  if (!feed) {
    feed = { abort: new AbortController(), waiters: 0, owner };
    const captured = feed;
    activeFeeds.set(view.tabId, captured);
    const current = () => !captured.abort.signal.aborted && view.isCurrent() && activeFeeds.get(view.tabId) === captured;
    const removeClose = view.onClose(() => captured.abort.abort());
    void consumeActionTraceSse(`/api/actions/trace/feed?owner=${encodeURIComponent(JSON.stringify(owner))}`, captured.abort.signal, {
      onTrace: (event) => { if (current())
        view.appendEvent(event); },
      onLine: (line) => { if (current())
        view.appendLine(line); },
      onDone: (data) => { if (current())
        view.finish(data); },
      onError: (message) => { if (current())
        view.observeError(message); },
    }).finally(() => { removeClose(); if (activeFeeds.get(view.tabId) === captured)
      activeFeeds.delete(view.tabId); });
  }
  feed.waiters += 1;
  const captured = feed;
  let released = false;
  return () => {
    if (released)
      return;
    released = true;
    captured.waiters -= 1;
    if (captured.waiters === 0 && activeFeeds.get(view.tabId) === captured) {
      activeFeeds.delete(view.tabId);
      captured.abort.abort();
    }
  };
}
