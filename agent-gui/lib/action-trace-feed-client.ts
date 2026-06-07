"use client";

import { buildActionTraceTabId } from "@/lib/action-trace-tab-id";
import {
  failActionTraceRunForTab,
  finishActionTraceRunForTab,
  prepareActionTraceTab,
  appendActionTraceEventForTab,
  appendActionTraceOutputForTab,
} from "@/lib/action-trace-overlay";
import { consumeActionTraceSse } from "@/lib/action-trace-sse";

const activeFeeds = new Map<string, AbortController>();

export function startActionTraceFeed(params: {
  actionId: string;
  param?: string;
  actionTitle?: string;
}): void {
  const actionId = params.actionId.trim();
  const param = params.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);

  stopActionTraceFeed(tabId);
  prepareActionTraceTab({ actionId, param, actionTitle: params.actionTitle });

  const abort = new AbortController();
  activeFeeds.set(tabId, abort);

  const feedUrl = `/api/actions/trace/feed?tabId=${encodeURIComponent(tabId)}`;
  void consumeActionTraceSse(feedUrl, abort.signal, {
    onLine: (line) => {
      appendActionTraceOutputForTab(tabId, `${line}\n`);
    },
    onTrace: (event) => {
      appendActionTraceEventForTab(tabId, event);
    },
    onDone: (data) => {
      finishActionTraceRunForTab(tabId, {
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
      activeFeeds.delete(tabId);
    },
    onError: (message) => {
      if (abort.signal.aborted) return;
      failActionTraceRunForTab(tabId, message);
      activeFeeds.delete(tabId);
    },
  });
}

export function stopActionTraceFeed(tabId: string): void {
  activeFeeds.get(tabId)?.abort();
  activeFeeds.delete(tabId);
}

export function stopActionTraceFeedForAction(
  actionId: string,
  param?: string,
): void {
  stopActionTraceFeed(buildActionTraceTabId(actionId, param));
}
