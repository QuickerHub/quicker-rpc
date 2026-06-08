"use client";

import { useSyncExternalStore } from "react";
import {
  buildActionTraceCommandLine,
  buildInlineXActionTraceCommandLine,
} from "@/lib/action-trace-command-line";
import type { InlineXActionProgram } from "@/lib/action-trace-inline-programs";
import {
  formatTraceEventsToText,
  parseActionTraceEvents,
  type ActionTraceEvent,
} from "@/lib/action-trace-format";
import {
  consumeActionTraceSse,
  consumeActionTraceSsePost,
} from "@/lib/action-trace-sse";
import {
  resolveActionTraceStreamPost,
  resolveActionTraceStreamUrl,
} from "@/lib/action-trace-stream-url";
import {
  buildActionTraceTabId,
  formatActionTraceTabLabel,
} from "@/lib/action-trace-tab-id";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import { SIDE_PANEL_VIEW_EXPLORER } from "@/lib/workspace-side-panel-view";

export type ActionTraceRunStatus = "idle" | "running" | "success" | "error";
export type ActionTraceViewMode = "timeline" | "terminal";

export type ActionTraceTabState = {
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

const streamAbortByTab = new Map<string, AbortController>();
const pendingOutputByTab = new Map<string, string>();
const pendingLineDeltaByTab = new Map<string, number>();
const pendingEventsByTab = new Map<string, ActionTraceEvent[]>();
let flushTimer: number | null = null;

/** Pace live trace UI so long runs feel streamed, not one burst per TCP chunk. */
const TRACE_UI_FLUSH_MS = 40;
const TRACE_MAX_LINES_PER_FLUSH = 18;
const TRACE_MAX_EVENTS_PER_FLUSH = 24;

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

function cancelTabStream(tabId: string): void {
  streamAbortByTab.get(tabId)?.abort();
  streamAbortByTab.delete(tabId);
  pendingOutputByTab.delete(tabId);
  pendingLineDeltaByTab.delete(tabId);
  pendingEventsByTab.delete(tabId);
}

function cancelFlushSchedule(): void {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function flushPendingForTab(tabId: string): void {
  while (flushPendingForTabPartial(tabId)) {
    // drain until empty
  }
}

/** @returns true when more output/events remain for this tab */
function flushPendingForTabPartial(tabId: string): boolean {
  const tab = findTab(tabId);
  if (!tab) {
    pendingOutputByTab.delete(tabId);
    pendingLineDeltaByTab.delete(tabId);
    pendingEventsByTab.delete(tabId);
    return false;
  }

  let next = tab;
  let hasMore = false;

  const pendingOutput = pendingOutputByTab.get(tabId);
  if (pendingOutput) {
    const lines = pendingOutput.split("\n");
    if (lines.length > TRACE_MAX_LINES_PER_FLUSH) {
      const chunkLines = lines.slice(0, TRACE_MAX_LINES_PER_FLUSH);
      const chunk = `${chunkLines.join("\n")}\n`;
      const lineDelta = Math.max(0, chunk.split("\n").length - 1);
      pendingOutputByTab.set(tabId, lines.slice(TRACE_MAX_LINES_PER_FLUSH).join("\n"));
      pendingLineDeltaByTab.set(
        tabId,
        Math.max(0, (pendingLineDeltaByTab.get(tabId) ?? 0) - lineDelta),
      );
      next = {
        ...next,
        output: next.output + chunk,
        lineCount: next.lineCount + lineDelta,
      };
      hasMore = true;
    } else {
      const pendingLineDelta = pendingLineDeltaByTab.get(tabId) ?? 0;
      next = {
        ...next,
        output: next.output + pendingOutput,
        lineCount: next.lineCount + pendingLineDelta,
      };
      pendingOutputByTab.delete(tabId);
      pendingLineDeltaByTab.delete(tabId);
    }
  }

  const pendingEvents = pendingEventsByTab.get(tabId);
  if (pendingEvents?.length) {
    const slice = pendingEvents.slice(0, TRACE_MAX_EVENTS_PER_FLUSH);
    const rest = pendingEvents.slice(TRACE_MAX_EVENTS_PER_FLUSH);
    const events = next.events.concat(slice);
    next = {
      ...next,
      events,
      eventCount: events.length,
    };
    if (rest.length > 0) {
      pendingEventsByTab.set(tabId, rest);
      hasMore = true;
    } else {
      pendingEventsByTab.delete(tabId);
    }
  }

  if (next !== tab) {
    updateTab(tabId, () => next);
  }

  return hasMore;
}

function flushAllPendingNow(): void {
  cancelFlushSchedule();
  for (const tab of state.tabs) {
    flushPendingForTab(tab.tabId);
  }
}

function scheduleFlush(_tabId: string): void {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    let remain = false;
    for (const tab of state.tabs) {
      if (flushPendingForTabPartial(tab.tabId)) {
        remain = true;
      }
    }
    if (remain) {
      scheduleFlush(_tabId);
    }
  }, TRACE_UI_FLUSH_MS);
}

function upsertTab(
  tabId: string,
  seed: Omit<ActionTraceTabState, "tabId">,
): ActionTraceTabState {
  const existing = findTab(tabId);
  const next: ActionTraceTabState = { tabId, ...seed };
  if (existing) {
    const tabs = state.tabs.map((tab) => (tab.tabId === tabId ? next : tab));
    setState({ tabs });
    return next;
  }
  setState({ tabs: [...state.tabs, next] });
  return next;
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
  cancelTabStream(tabId);
  flushPendingForTab(tabId);
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

/** @deprecated use closeActionTraceTab */
export function hideActionTraceOverlay(): void {
  const tab = state.tabs[state.tabs.length - 1];
  if (tab) closeActionTraceTab(tab.tabId);
}

export function setActionTraceViewMode(
  tabId: string,
  viewMode: ActionTraceViewMode,
): void {
  const tab = findTab(tabId);
  if (!tab || tab.viewMode === viewMode) return;
  updateTab(tabId, (current) => ({ ...current, viewMode }));
}

function appendOutput(tabId: string, chunk: string): void {
  if (!findTab(tabId)) return;
  pendingOutputByTab.set(
    tabId,
    (pendingOutputByTab.get(tabId) ?? "") + chunk,
  );
  pendingLineDeltaByTab.set(
    tabId,
    (pendingLineDeltaByTab.get(tabId) ?? 0)
      + Math.max(0, chunk.split("\n").length - 1),
  );
  scheduleFlush(tabId);
}

function appendEvent(tabId: string, event: ActionTraceEvent): void {
  if (!findTab(tabId)) return;
  const batch = pendingEventsByTab.get(tabId) ?? [];
  batch.push(event);
  pendingEventsByTab.set(tabId, batch);
  scheduleFlush(tabId);
}

export function appendActionTraceEventForTab(
  tabId: string,
  event: ActionTraceEvent,
): void {
  appendEvent(tabId, event);
}

export function appendActionTraceOutputForTab(
  tabId: string,
  chunk: string,
): void {
  appendOutput(tabId, chunk);
}

function finishTabRun(
  tabId: string,
  payload: {
    ok: boolean;
    message?: string;
    returnResult?: string;
    errorMessage?: string;
    eventCount?: number;
    durationMs?: number;
  },
): void {
  flushPendingForTab(tabId);
  const tab = findTab(tabId);
  if (!tab) return;

  let output = tab.output;
  if (payload.returnResult?.trim()) {
    output = `${output.trimEnd()}\n\n=> ${payload.returnResult.trim()}\n`;
  }
  if (payload.errorMessage?.trim()) {
    output = `${output.trimEnd()}\n\n[error] ${payload.errorMessage.trim()}\n`;
  }
  if (payload.message?.trim()) {
    output = `${output.trimEnd()}\n\n${payload.message.trim()}\n`;
  }

  updateTab(tabId, (current) => ({
    ...current,
    output,
    status: "success",
    summary: payload.message,
    returnResult: payload.returnResult,
    errorMessage: payload.errorMessage,
    eventCount: payload.eventCount ?? current.events.length,
    durationMs: payload.durationMs,
  }));
  streamAbortByTab.delete(tabId);
}

function failTabRun(tabId: string, message: string): void {
  flushPendingForTab(tabId);
  const tab = findTab(tabId);
  if (!tab) return;
  updateTab(tabId, (current) => ({
    ...current,
    status: "error",
    errorMessage: message,
    output: current.output.trim()
      ? `${current.output.trimEnd()}\n\n[error] ${message}\n`
      : `[error] ${message}\n`,
  }));
  cancelTabStream(tabId);
}

export function finishActionTraceRunForTab(
  tabId: string,
  payload: Parameters<typeof finishTabRun>[1],
): void {
  finishTabRun(tabId, payload);
}

export function failActionTraceRunForTab(tabId: string, message: string): void {
  failTabRun(tabId, message);
}

/** Open/focus a trace tab while Agent trace is running (no SSE). */
export function prepareActionTraceTab(params: {
  actionId: string;
  param?: string;
  actionTitle?: string;
}): string {
  const actionId = params.actionId.trim();
  const tabId = buildActionTraceTabId(actionId, params.param);
  upsertTab(tabId, {
    actionId,
    param: params.param,
    actionTitle: params.actionTitle,
    commandLine: buildActionTraceCommandLine(actionId, params.param),
    output: "",
    events: [],
    viewMode: "timeline",
    status: "running",
    lineCount: 0,
  });
  focusTraceTab(tabId);
  return tabId;
}

/** Load completed trace from agent tool output (no SSE re-run). */
export function hydrateActionTraceFromToolOutput(
  data: Record<string, unknown>,
  options?: { actionId?: string; param?: string; actionTitle?: string },
): void {
  const events = parseActionTraceEvents(data);
  const actionId =
    (typeof data.actionId === "string" ? data.actionId.trim() : "")
    || options?.actionId?.trim()
    || "";
  const param = options?.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);
  const existing = findTab(tabId);

  if (existing && existing.events.length > 0) {
    finishTabRun(tabId, {
      ok: data.ok !== false,
      message: typeof data.message === "string" ? data.message : undefined,
      returnResult:
        typeof data.returnResult === "string" ? data.returnResult : undefined,
      errorMessage:
        typeof data.errorMessage === "string" ? data.errorMessage : undefined,
      eventCount:
        typeof data.eventCount === "number"
          ? data.eventCount
          : existing.events.length,
      durationMs:
        typeof data.durationMs === "number" ? data.durationMs : undefined,
    });
    focusTraceTab(tabId);
    return;
  }

  cancelTabStream(tabId);

  const actionTitle =
    typeof data.actionTitle === "string"
      ? data.actionTitle.trim()
      : options?.actionTitle?.trim();
  const commandLine = actionId
    ? buildActionTraceCommandLine(actionId, param)
    : "qkrpc action run --trace";

  upsertTab(tabId, {
    actionId,
    param,
    actionTitle: actionTitle || undefined,
    commandLine,
    output: formatTraceEventsToText(events),
    events,
    viewMode: "timeline",
    status: "success",
    summary: typeof data.message === "string" ? data.message : undefined,
    returnResult:
      typeof data.returnResult === "string" ? data.returnResult : undefined,
    errorMessage:
      typeof data.errorMessage === "string" ? data.errorMessage : undefined,
    eventCount:
      typeof data.eventCount === "number" ? data.eventCount : events.length,
    durationMs:
      typeof data.durationMs === "number" ? data.durationMs : undefined,
    lineCount: events.length,
  });

  focusTraceTab(tabId);
}

export function startActionTraceStream(params: {
  actionId: string;
  param?: string;
  actionTitle?: string;
  xaction?: InlineXActionProgram;
}): void {
  const actionId = params.actionId.trim();
  const param = params.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);
  cancelTabStream(tabId);

  const commandLine = params.xaction
    ? buildInlineXActionTraceCommandLine(param)
    : buildActionTraceCommandLine(actionId, param);

  upsertTab(tabId, {
    actionId,
    param,
    actionTitle: params.actionTitle ?? params.xaction?.title,
    commandLine,
    output: "",
    events: [],
    viewMode: "timeline",
    status: "running",
    lineCount: 0,
  });

  focusTraceTab(tabId);

  const abort = new AbortController();
  streamAbortByTab.set(tabId, abort);

  const handlers = {
    onLine: (line: string) => {
      appendOutput(tabId, `${line}\n`);
    },
    onTrace: (event: ActionTraceEvent) => {
      appendEvent(tabId, event);
    },
    onDone: (data: Record<string, unknown>) => {
      finishTabRun(tabId, {
        ok: data.ok === true,
        message: typeof data.message === "string" ? data.message : undefined,
        returnResult:
          typeof data.returnResult === "string" ? data.returnResult : undefined,
        errorMessage:
          typeof data.errorMessage === "string" ? data.errorMessage : undefined,
        eventCount:
          typeof data.eventCount === "number" ? data.eventCount : undefined,
        durationMs:
          typeof data.durationMs === "number" ? data.durationMs : undefined,
      });
    },
    onError: (message: string) => {
      if (abort.signal.aborted) return;
      const tab = findTab(tabId);
      if (tab?.status === "running") {
        failTabRun(tabId, message);
      }
    },
  };

  if (params.xaction) {
    const ephemeralId =
      actionId || params.xaction.title?.trim() || `ephemeral:${Date.now()}`;
    const post = resolveActionTraceStreamPost({
      ephemeralId,
      xaction: params.xaction,
      param,
    });
    void consumeActionTraceSsePost(post.url, post.body, abort.signal, handlers);
    return;
  }

  const streamUrl = resolveActionTraceStreamUrl(actionId, param);
  void consumeActionTraceSse(streamUrl, abort.signal, handlers);
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
