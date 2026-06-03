import type { FaIconGeometry } from "@/lib/fa-icon";
import { isFaIconSpec, uniqueFaSpecs } from "@/lib/fa-icon";

const STORAGE_KEY = "agent-gui:fa-icon-cache:v1";
const MAX_PERSISTED = 256;

const memory = new Map<string, FaIconGeometry>();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let flushQueue = new Set<string>();
let flushScheduled = false;
let inFlight: Promise<void> | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function loadPersisted(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const items = JSON.parse(raw) as FaIconGeometry[];
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const spec = item.spec?.trim();
      if (!spec || !item.path) continue;
      memory.set(spec, item);
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function schedulePersist(): void {
  if (typeof sessionStorage === "undefined") return;
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const items = [...memory.values()].slice(-MAX_PERSISTED);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* quota or private mode */
    }
  }, 400);
}

function putGeometry(item: FaIconGeometry): void {
  const spec = item.spec?.trim();
  if (!spec || !item.path) return;
  memory.set(spec, item);
}

export function getFaIconFromCache(spec: string): FaIconGeometry | undefined {
  return memory.get(spec.trim());
}

export function subscribeFaIconCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFaIconCacheSnapshot(): ReadonlyMap<string, FaIconGeometry> {
  return memory;
}

async function fetchMissingSpecs(specs: string[]): Promise<void> {
  const missing = specs.filter((s) => !memory.has(s));
  if (missing.length === 0) return;

  const res = await fetch("/api/fa/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specs: missing }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    items?: FaIconGeometry[];
  };
  if (!data.ok || !Array.isArray(data.items)) return;

  let added = false;
  for (const item of data.items) {
    if (!memory.has(item.spec)) added = true;
    putGeometry(item);
  }
  if (added) {
    schedulePersist();
    notify();
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const batch = [...flushQueue];
    flushQueue = new Set();
    const missing = batch.filter((s) => !memory.has(s));
    if (missing.length === 0) return;

    const run = async () => {
      await fetchMissingSpecs(missing);
    };
    inFlight = run().finally(() => {
      inFlight = null;
      if (flushQueue.size > 0) scheduleFlush();
    });
  });
}

/** Queue FA specs for batched resolve; returns immediately if already cached. */
export function ensureFaIconsResolved(specs: Iterable<string | undefined>): void {
  const list = uniqueFaSpecs(specs);
  for (const spec of list) {
    if (!memory.has(spec)) flushQueue.add(spec);
  }
  if (flushQueue.size > 0) scheduleFlush();
}

/** Await in-flight resolve (tests / optional). */
export async function flushFaIconCache(): Promise<void> {
  if (inFlight) await inFlight;
}

loadPersisted();
