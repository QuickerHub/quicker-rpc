"use client";

import { useSyncExternalStore } from "react";

export type ActionProjectImportEntry = {
  actionId: string;
  projectDirectory?: string;
  source: "tool" | "pull" | "resolve";
};

type ImportStore = {
  byId: Map<string, ActionProjectImportEntry>;
};

let store: ImportStore = { byId: new Map() };
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function normalizeId(actionId: string): string {
  return actionId.trim().toLowerCase();
}

export function beginActionProjectImport(
  actionId: string,
  options?: { projectDirectory?: string; source?: ActionProjectImportEntry["source"] },
): void {
  const id = normalizeId(actionId);
  if (!id) return;
  const next = new Map(store.byId);
  next.set(id, {
    actionId: id,
    projectDirectory: options?.projectDirectory?.trim() || undefined,
    source: options?.source ?? "tool",
  });
  store = { byId: next };
  notify();
}

export function endActionProjectImport(actionId: string): void {
  const id = normalizeId(actionId);
  if (!id || !store.byId.has(id)) return;
  const next = new Map(store.byId);
  next.delete(id);
  store = { byId: next };
  notify();
}

export function replaceActionProjectImports(entries: ActionProjectImportEntry[]): void {
  const next = new Map<string, ActionProjectImportEntry>();
  for (const entry of entries) {
    const id = normalizeId(entry.actionId);
    if (!id) continue;
    next.set(id, { ...entry, actionId: id });
  }
  store = { byId: next };
  notify();
}

export function isActionProjectImporting(actionId: string | undefined): boolean {
  if (!actionId?.trim()) return false;
  return store.byId.has(normalizeId(actionId));
}

/** Read importing flag from a store snapshot (no per-row subscription). */
export function isActionProjectImportingInMap(
  imports: ReadonlyMap<string, ActionProjectImportEntry>,
  actionId: string | undefined,
): boolean {
  if (!actionId?.trim()) return false;
  return imports.has(normalizeId(actionId));
}

export function readActionProjectImportEntry(
  actionId: string | undefined,
): ActionProjectImportEntry | undefined {
  if (!actionId?.trim()) return undefined;
  return store.byId.get(normalizeId(actionId));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ImportStore {
  return store;
}

export function useActionProjectImporting(actionId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isActionProjectImporting(actionId),
    () => false,
  );
}

export function useActionProjectImportStore(): ReadonlyMap<string, ActionProjectImportEntry> {
  return useSyncExternalStore(
    subscribe,
    () => store.byId,
    () => new Map(),
  );
}
