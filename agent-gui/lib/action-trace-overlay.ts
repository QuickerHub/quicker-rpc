"use client";

import { useSyncExternalStore } from "react";
import { buildActionTraceCommandLine } from "@/lib/action-trace-command-line";
import {
  formatTraceEventsToText,
  parseActionTraceEvents,
  type ActionTraceEvent,
} from "@/lib/action-trace-format";
import { consumeActionTraceSse } from "@/lib/action-trace-sse";
import { resolveActionTraceStreamUrl } from "@/lib/action-trace-stream-url";
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
const listeners = new Set<() => void>();

const streamAbortByTab = new Map<string, AbortController>();
const pendingOutputByTab = new Map<string, string>();
const pendingLineDeltaByTab = new Map<string, number>();
const pendingEventsByTab = new Map<string, ActionTraceEvent[]>();
let flushHandle: number | null = null;

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

function flushPendingForTab(tabId: string): void {
  const tab = findTab(tabId);
  if (!tab) {
    pendingOutputByTab.delete(tabId);
    pendingLineDeltaByTab.delete(tabId);
    pendingEventsByTab.delete(tabId);
    return;
  }

  let next = tab;
  const pendingOutput = pendingOutputByTab.get(tabId);
  const pendingLineDelta = pendingLineDeltaByTab.get(tabId) ?? 0;
  if (pendingOutput) {
    next = {
      ...next,
      output: next.output + pendingOutput,
      lineCount: next.lineCount + pendingLineDelta,
    };
    pendingOutputByTab.delete(tabId);
    pendingLineDeltaByTab.delete(tabId);
  }

  const pendingEvents = pendingEventsByTab.get(tabId);
  if (pendingEvents?.length) {
    const events = next.events.concat(pendingEvents);
    next = {
      ...next,
      events,
      eventCount: events.length,
    };
    pendingEventsByTab.delete(tabId);
  }

  if (next !== tab) {
    updateTab(tabId, () => next);
  }
}

function flushAllPendingNow(): void {
  if (flushHandle != null) {
    cancelAnimationFrame(flushHandle);
    flushHandle = null;
  }
  for (const tab of state.tabs) {
    flushPendingForTab(tab.tabId);
  }
}

function scheduleFlush(tabId: string): void {
  void tabId;
  if (flushHandle != null) return;
  flushHandle = requestAnimationFrame(() => {
    flushHandle = null;
    for (const tab of state.tabs) {
      flushPendingForTab(tab.tabId);
    }
  });
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
    status: payload.ok ? "success" : "error",
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
  const events = parseActionTraceEvents(data.events);
  const actionId =
    (typeof data.actionId === "string" ? data.actionId.trim() : "")
    || options?.actionId?.trim()
    || "";
  const param = options?.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);
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
    status: data.ok === false ? "error" : "success",
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
}): void {
  const actionId = params.actionId.trim();
  const param = params.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);
  cancelTabStream(tabId);

  const commandLine = buildActionTraceCommandLine(actionId, param);
  const streamUrl = resolveActionTraceStreamUrl(actionId, param);

  upsertTab(tabId, {
    actionId,
    param,
    actionTitle: params.actionTitle,
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

  void consumeActionTraceSse(streamUrl, abort.signal, {
    onLine: (line) => {
      appendOutput(tabId, `${line}\n`);
    },
    onTrace: (event) => {
      appendEvent(tabId, event);
    },
    onDone: (data) => {
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
    onError: (message) => {
      if (abort.signal.aborted) return;
      const tab = findTab(tabId);
      if (tab?.status === "running") {
        failTabRun(tabId, message);
      }
    },
  });
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
