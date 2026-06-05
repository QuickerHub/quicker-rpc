"use client";

import { useSyncExternalStore } from "react";

export type AppConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, primary button uses danger styling. */
  danger?: boolean;
  /** When true, focus the confirm button on open (default: cancel). */
  defaultConfirm?: boolean;
};

type AppConfirmRequest = {
  id: string;
  message: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  defaultConfirm: boolean;
  resolve: (confirmed: boolean) => void;
};

let nextId = 1;
let active: AppConfirmRequest | null = null;
const queue: AppConfirmRequest[] = [];
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function createId(): string {
  return `app-confirm-${nextId++}`;
}

function showNext(): void {
  if (active || queue.length === 0) return;
  active = queue.shift() ?? null;
  notifyListeners();
}

export function appConfirm(
  message: string,
  options?: AppConfirmOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({
      id: createId(),
      message,
      title: options?.title ?? "QuickerAgent",
      confirmLabel: options?.confirmLabel ?? "确定",
      cancelLabel: options?.cancelLabel ?? "取消",
      danger: options?.danger ?? false,
      defaultConfirm: options?.defaultConfirm ?? false,
      resolve,
    });
    showNext();
  });
}

export function resolveAppConfirm(confirmed: boolean): void {
  if (!active) return;
  const current = active;
  active = null;
  current.resolve(confirmed);
  notifyListeners();
  showNext();
}

function getSnapshot(): AppConfirmRequest | null {
  return active;
}

function getServerSnapshot(): AppConfirmRequest | null {
  return null;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useAppConfirmRequest(): AppConfirmRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
