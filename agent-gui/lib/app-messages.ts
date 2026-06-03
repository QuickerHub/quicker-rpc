"use client";

import { useSyncExternalStore } from "react";

export type AppMessageKind = "info" | "success" | "warning" | "error";

export type AppMessageAction = {
  label: string;
  primary?: boolean;
  onClick?: () => void | Promise<void>;
};

export type AppMessageInput = {
  /** Stable id — replaces an existing toast with the same id. */
  id?: string;
  kind?: AppMessageKind;
  title?: string;
  body: string;
  actions?: AppMessageAction[];
  /** Default true. */
  dismissible?: boolean;
  autoDismissMs?: number;
};

export type AppMessage = {
  id: string;
  kind: AppMessageKind;
  title?: string;
  body: string;
  actions: AppMessageAction[];
  dismissible: boolean;
  autoDismissMs?: number;
  createdAt: number;
};

let nextId = 1;
let messages: AppMessage[] = [];
const listeners = new Set<() => void>();
const autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function createId(): string {
  return `app-msg-${nextId++}`;
}

function scheduleAutoDismiss(message: AppMessage): void {
  if (!message.autoDismissMs || message.autoDismissMs <= 0) return;
  const existing = autoDismissTimers.get(message.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    autoDismissTimers.delete(message.id);
    dismissAppMessage(message.id);
  }, message.autoDismissMs);
  autoDismissTimers.set(message.id, timer);
}

function normalizeInput(input: AppMessageInput): AppMessage {
  return {
    id: input.id ?? createId(),
    kind: input.kind ?? "info",
    title: input.title,
    body: input.body,
    actions: input.actions ?? [],
    dismissible: input.dismissible !== false,
    autoDismissMs: input.autoDismissMs,
    createdAt: Date.now(),
  };
}

export function pushAppMessage(input: AppMessageInput): string {
  const message = normalizeInput(input);
  const index = messages.findIndex((m) => m.id === message.id);
  if (index >= 0) {
    const prev = autoDismissTimers.get(message.id);
    if (prev) clearTimeout(prev);
    messages = [...messages.slice(0, index), message, ...messages.slice(index + 1)];
  } else {
    messages = [...messages, message];
  }
  scheduleAutoDismiss(message);
  notifyListeners();
  return message.id;
}

export function dismissAppMessage(id: string): void {
  const timer = autoDismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    autoDismissTimers.delete(id);
  }
  const next = messages.filter((m) => m.id !== id);
  if (next.length === messages.length) return;
  messages = next;
  notifyListeners();
}

function getSnapshot(): AppMessage[] {
  return messages;
}

const emptySnapshot: AppMessage[] = [];

function getServerSnapshot(): AppMessage[] {
  return emptySnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useAppMessages(): AppMessage[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
