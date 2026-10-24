"use client";

import { useSyncExternalStore } from "react";
import { buildActionTraceCommandLine, buildInlineXActionTraceCommandLine } from "@/lib/action-trace-command-line";
import {
  formatTraceEventsToText,
  parseActionTraceEvents,
  type ActionTraceEvent,
} from "@/lib/action-trace-format";
import { formatActionTraceTabLabel } from "@/lib/action-trace-tab-id";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import { SIDE_PANEL_VIEW_EXPLORER } from "@/lib/workspace-side-panel-view";
import { readTraceRunOwner, sameTraceRunOwner, traceRunTabId, type TraceRunOwner } from "./action-trace-owner";
import { createTraceEventDedupe } from "./action-trace-event-dedupe";

export type ActionTraceRunStatus = "idle" | "running" | "success" | "error";
export type ActionTraceViewMode = "timeline" | "terminal";

export type ActionTraceTabState = {
  owner?: TraceRunOwner;
  observationError?: string;
  resultUnknown?: boolean;
  tabId: string;
  actionId: string;
  param?: string;
  actionTitle?: string;
  commandLine: string;
  output: string;
  events: ActionTraceEvent[];
  viewMode: ActionTraceViewMode;
  status: ActionTraceRunStatus;
  summary?: string;
  returnResult?: string;
  errorMessage?: string;
  eventCount?: number;
  durationMs?: number;
  lineCount: number;
};

type StoreState = {
  tabs: ActionTraceTabState[];
};

const emptyStore: StoreState = { tabs: [] };
let state: StoreState = emptyStore;
const serverSnapshot: StoreState = emptyStore;
const traceStateByThread = new Map<string, StoreState>();
let activeTraceThreadId: string | null = null;
const listeners = new Set<() => void>();

/** Pace live trace UI so long runs feel streamed, not one burst per TCP chunk. */
const TRACE_UI_FLUSH_MS = 40;

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: StoreState): void {
  state = next;
  notifyListeners();
}

function findTab(tabId: string): ActionTraceTabState | undefined {
  return state.tabs.find((tab) => tab.tabId === tabId);
}

function updateTab(
  tabId: string,
  updater: (tab: ActionTraceTabState) => ActionTraceTabState,
): void {
  const index = state.tabs.findIndex((tab) => tab.tabId === tabId);
  if (index < 0) return;
  const tabs = state.tabs.slice();
  tabs[index] = updater(tabs[index]!);
  setState({ tabs });
}

function focusTraceTab(tabId: string): void {
  workspaceExplorerActionsRef.current.focusSidePanelView(tabId);
}

export function getActionTraceTabs(): ActionTraceTabState[] {
  return state.tabs;
}

/** Swap visible trace tabs when the active chat thread changes. */
export function switchActionTraceThread(threadId: string): void {
  const nextId = threadId.trim();
  if (!nextId || activeTraceThreadId === nextId) return;
  if (activeTraceThreadId) {
    traceStateByThread.set(activeTraceThreadId, state);
  }
  activeTraceThreadId = nextId;
  state = traceStateByThread.get(nextId) ?? emptyStore;
  notifyListeners();
}

export function getActionTraceTab(tabId: string): ActionTraceTabState | null {
  return findTab(tabId) ?? null;
}

export function closeActionTraceTab(
  tabId: string,
  options?: { wasActive?: boolean },
): void {
  traceViews.get(tabId)?.close();
  const tabs = state.tabs.filter((tab) => tab.tabId !== tabId);
  setState({ tabs });
  const wasActive = options?.wasActive ?? true;
  if (!wasActive) return;
  const shell = workspaceExplorerActionsRef.current;
  if (tabs.length > 0) {
    shell.focusSidePanelView(tabs[tabs.length - 1]!.tabId);
  } else {
    shell.setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
  }
}

export function setActionTraceViewMode(
  tabId: string,
  viewMode: ActionTraceViewMode,
): void {
  const tab = findTab(tabId);
  if (!tab || tab.viewMode === viewMode) return;
  updateTab(tabId, (current) => ({ ...current, viewMode }));
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useActionTraceTabs(): ActionTraceTabState[] {
  return useSyncExternalStore(
    subscribe,
    () => state.tabs,
    () => serverSnapshot.tabs,
  );
}

export function useActionTraceTab(tabId: string | null): ActionTraceTabState | null {
  return useSyncExternalStore(
    subscribe,
    () => (tabId ? findTab(tabId) ?? null : null),
    () => null,
  );
}

/** Tab label for side panel tab bar. */
export function getActionTraceTabBarLabel(tab: ActionTraceTabState): string {
  return formatActionTraceTabLabel({
    actionId: tab.actionId,
    actionTitle: tab.actionTitle,
    status: tab.status,
  });
}

export type TraceViewLease = {
  tabId: string; threadId: string; cwd: string; owner?: TraceRunOwner;
  isCurrent: () => boolean;
  appendEvent: (event: ActionTraceEvent) => void;
  appendLine: (line: string) => void;
  observeError: (message: string) => void;
  finish: (data: Record<string, unknown>) => void;
  hydrate: (data: Record<string, unknown>) => void;
  onClose: (listener: () => void) => () => void;
  close: () => void;
};
const traceViews = new Map<string, TraceViewLease>();
const closedTraceViews = new Set<string>();
function threadState(threadId: string): StoreState {
  return activeTraceThreadId === threadId ? state : traceStateByThread.get(threadId) ?? emptyStore;
}
function mutateThread(threadId: string, update: (current: StoreState) => StoreState): void {
  const next = update(threadState(threadId));
  if (activeTraceThreadId === threadId) setState(next);
  else traceStateByThread.set(threadId, next);
}

/** A view observes one immutable run and survives presentation changes. Closing never stops native work. */
type TraceDisplayMetadata = { actionTitle?: string; commandLine?: string };
function createTraceView(params: { tabId: string; threadId: string; cwd: string; actionId: string; param?: string; owner?: TraceRunOwner; focus?: boolean; display?: TraceDisplayMetadata }): TraceViewLease | null {
  const { tabId, threadId, cwd, owner } = params;
  if (closedTraceViews.has(tabId)) return null;
  const existing = traceViews.get(tabId);
  if (existing) return (!owner || existing.owner && sameTraceRunOwner(existing.owner, owner)) ? existing : null;
  let closed = false, terminal = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let events: ActionTraceEvent[] = [], lines: string[] = [];
  const dedupe = createTraceEventDedupe();
  const closeListeners = new Set<() => void>();
  const isCurrent = () => !closed && traceViews.get(tabId) === lease;
  const update = (change: (tab: ActionTraceTabState) => ActionTraceTabState) => {
    if (!isCurrent()) return;
    mutateThread(threadId, (store) => ({ tabs: store.tabs.map((tab) => tab.tabId === tabId && isCurrent() ? change(tab) : tab) }));
  };
  const flush = () => {
    if (timer) clearTimeout(timer); timer = undefined;
    if (!isCurrent()) return;
    const addedEvents = events, addedLines = lines; events = []; lines = [];
    if (addedEvents.length || addedLines.length) update((tab) => ({ ...tab, events: [...tab.events, ...addedEvents],
      output: tab.output + addedLines.join(""), lineCount: tab.lineCount + addedLines.length }));
  };
  const schedule = () => { timer ??= setTimeout(flush, TRACE_UI_FLUSH_MS); };
  const matches = (data: Record<string, unknown>) => !owner || Boolean(readTraceRunOwner(data.traceOwner) && sameTraceRunOwner(owner, readTraceRunOwner(data.traceOwner)!));
  const completed = (tab: ActionTraceTabState, data: Record<string, unknown>, replacement?: ActionTraceEvent[]): ActionTraceTabState => {
    const allEvents = replacement ?? tab.events;
    const message = typeof data.message === "string" ? data.message : undefined;
    const errorMessage = typeof data.errorMessage === "string" ? data.errorMessage : data.ok === false ? message : undefined;
    const returnResult = typeof data.returnResult === "string" ? data.returnResult : undefined;
    const text = formatTraceEventsToText(allEvents);
    return { ...tab, events: allEvents, output: [text.trimEnd(), returnResult ? `=> ${returnResult}` : "", errorMessage ? `[error] ${errorMessage}` : ""].filter(Boolean).join("\n"),
      status: data.ok === false ? "error" : "success", summary: message, errorMessage, returnResult,
      observationError: undefined, resultUnknown: data.error === "WRITE_RESULT_UNKNOWN" || data.errorCode === "WRITE_RESULT_UNKNOWN",
      eventCount: typeof data.eventCount === "number" ? data.eventCount : allEvents.length,
      durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined };
  };
  const lease: TraceViewLease = {
    tabId, threadId, cwd, owner, isCurrent,
    appendEvent(event) {
      if (!isCurrent() || terminal) return;
      if (!dedupe.accept(event)) return;
      events.push(event); schedule();
    },
    appendLine(line) { if (isCurrent() && !terminal) { lines.push(`${line}\n`); schedule(); } },
    observeError(message) { if (isCurrent() && !terminal) { flush(); update((tab) => ({ ...tab, status: "error", errorMessage: message, observationError: message, resultUnknown: true })); } },
    finish(data) { if (!isCurrent() || terminal || !matches(data)) return; flush(); terminal = true; dedupe.clear(); update((tab) => completed(tab, data)); },
    hydrate(data) {
      if (!isCurrent() || !matches(data)) return;
      flush(); terminal = true;
      dedupe.clear();
      const parsed = parseActionTraceEvents(data);
      update((tab) => completed(tab, data, parsed.length ? parsed : undefined));
    },
    onClose(listener) { if (closed) listener(); else closeListeners.add(listener); return () => { closeListeners.delete(listener); }; },
    close() {
      if (closed) return; closed = true; if (timer) clearTimeout(timer); events = []; lines = [];
      dedupe.clear();
      traceViews.delete(tabId); closedTraceViews.add(tabId);
      for (const listener of closeListeners) listener(); closeListeners.clear();
    },
  };
  traceViews.set(tabId, lease);
  mutateThread(threadId, (store) => ({ tabs: [...store.tabs, { tabId, actionId: params.actionId, param: params.param, owner,
    actionTitle: params.display?.actionTitle, commandLine: params.display?.commandLine ?? buildActionTraceCommandLine(params.actionId, params.param), output: "", events: [], viewMode: "timeline", status: "running", lineCount: 0 }] }));
  if (params.focus && activeTraceThreadId === threadId) focusTraceTab(tabId);
  return lease;
}
export function prepareOwnedTraceView(owner: TraceRunOwner, focus = false, presentation?: { threadId: string; messageId: string }, display?: TraceDisplayMetadata): TraceViewLease | null {
  const replay = presentation && presentation.threadId !== owner.threadId;
  const tabId = traceRunTabId(owner) + (replay ? `:replay:${encodeURIComponent(presentation.threadId)}:${encodeURIComponent(presentation.messageId)}` : "");
  return createTraceView({ tabId, threadId: presentation?.threadId ?? owner.threadId, cwd: owner.cwd, actionId: owner.actionId, param: owner.param, owner, focus, display });
}
export function prepareHistoricalTraceView(params: { threadId: string; cwd: string; messageId: string; partKey: string; actionId: string; param?: string }): TraceViewLease | null {
  return createTraceView({ ...params, tabId: `__trace__:history:${encodeURIComponent(params.threadId)}:${encodeURIComponent(params.messageId)}:${encodeURIComponent(params.partKey)}` });
}
export function releaseActionTraceThread(threadId: string): void {
  for (const view of traceViews.values()) if (view.threadId === threadId) view.close();
  traceStateByThread.delete(threadId);
  if (activeTraceThreadId === threadId) setState(emptyStore);
}

let manualPresentationSequence = 0;
export function prepareManualTracePendingView(params: { threadId: string; cwd: string; actionId: string; param?: string; focus: boolean; actionTitle?: string; inline?: boolean }): TraceViewLease {
  return createTraceView({ ...params, display: { actionTitle: params.actionTitle,
    commandLine: params.inline ? buildInlineXActionTraceCommandLine(params.param) : buildActionTraceCommandLine(params.actionId, params.param) },
    tabId: `__trace__:pending:${encodeURIComponent(params.threadId)}:${++manualPresentationSequence}` })!;
}
export function promoteManualTraceView(pending: TraceViewLease, owner: TraceRunOwner, focus: boolean): TraceViewLease | null {
  if (!pending.isCurrent()) return null;
  const previous = threadState(pending.threadId).tabs.find((tab) => tab.tabId === pending.tabId);
  const display = { actionTitle: previous?.actionTitle, commandLine: previous?.commandLine };
  pending.close();
  mutateThread(pending.threadId, (store) => ({ tabs: store.tabs.filter((tab) => tab.tabId !== pending.tabId) }));
  return prepareOwnedTraceView(owner, focus, { threadId: pending.threadId, messageId: pending.tabId }, display);
}
