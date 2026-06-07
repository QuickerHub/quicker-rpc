import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { resolvePersistedDataFilePath } from "@/lib/quicker-agent-persisted-data";
import { defaultLauncherToolIds } from "@/lib/chat-mode";
import { newRandomId } from "@/lib/new-id";
import {
  formatLauncherCommandCachePromptBlock,
  matchLauncherCommandCacheEntries,
  normalizeLauncherCommandPhrase,
  type LauncherCachedToolStep,
  type LauncherCommandCacheEntry,
} from "@/lib/launcher/launcher-command-cache-core";

export type {
  LauncherCachedToolStep,
  LauncherCommandCacheEntry,
  LauncherCommandCacheMatch,
} from "@/lib/launcher/launcher-command-cache-core";

export {
  formatLauncherCommandCachePromptBlock,
  normalizeLauncherCommandPhrase,
  scoreLauncherCommandMatch,
} from "@/lib/launcher/launcher-command-cache-core";

type LauncherCommandCacheFile = {
  v: 1;
  entries: LauncherCommandCacheEntry[];
};

const CACHE_VERSION = 1 as const;
const MAX_ENTRIES = 64;
const MAX_STEPS = 8;

const ALLOWED_CACHE_TOOL_NAMES = new Set(
  defaultLauncherToolIds().filter((id) => id !== "launcher_command_cache"),
);

let cache: LauncherCommandCacheFile | null = null;

export function resolveLauncherCommandCachePath(): string {
  return resolvePersistedDataFilePath("launcher-command-cache.json");
}

function emptyCacheFile(): LauncherCommandCacheFile {
  return { v: CACHE_VERSION, entries: [] };
}

function normalizeAliases(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const aliases = [
    ...new Set(
      raw
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  return aliases.length > 0 ? aliases : undefined;
}

function normalizeSteps(raw: unknown): LauncherCachedToolStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: LauncherCachedToolStep[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Partial<LauncherCachedToolStep>;
    const toolName =
      typeof row.toolName === "string" ? row.toolName.trim() : "";
    if (!toolName || !ALLOWED_CACHE_TOOL_NAMES.has(toolName)) continue;
    const input =
      typeof row.input === "object" && row.input !== null && !Array.isArray(row.input)
        ? (row.input as Record<string, unknown>)
        : {};
    steps.push({ toolName, input });
    if (steps.length >= MAX_STEPS) break;
  }
  return steps;
}

function parseCacheFile(raw: unknown): LauncherCommandCacheFile {
  if (typeof raw !== "object" || raw === null) return emptyCacheFile();
  const data = raw as Partial<LauncherCommandCacheFile>;
  if (data.v !== CACHE_VERSION || !Array.isArray(data.entries)) {
    return emptyCacheFile();
  }

  const entries: LauncherCommandCacheEntry[] = [];
  for (const item of data.entries) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Partial<LauncherCommandCacheEntry>;
    const trigger = typeof row.trigger === "string" ? row.trigger.trim() : "";
    if (!trigger) continue;
    const steps = normalizeSteps(row.steps);
    if (steps.length === 0) continue;

    entries.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : newRandomId(),
      trigger,
      aliases: normalizeAliases(row.aliases),
      steps,
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : undefined,
      createdAt:
        typeof row.createdAt === "string" && row.createdAt.trim()
          ? row.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof row.updatedAt === "string" && row.updatedAt.trim()
          ? row.updatedAt
          : new Date().toISOString(),
      lastUsedAt:
        typeof row.lastUsedAt === "string" && row.lastUsedAt.trim()
          ? row.lastUsedAt
          : undefined,
      useCount:
        typeof row.useCount === "number" && row.useCount >= 0
          ? Math.floor(row.useCount)
          : 0,
    });
  }

  return { v: CACHE_VERSION, entries };
}

export function loadLauncherCommandCache(): LauncherCommandCacheFile {
  if (cache) return cache;
  const path = resolveLauncherCommandCachePath();
  if (!existsSync(path)) {
    cache = emptyCacheFile();
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    cache = parseCacheFile(raw);
    return cache;
  } catch {
    cache = emptyCacheFile();
    return cache;
  }
}

function saveLauncherCommandCache(data: LauncherCommandCacheFile): void {
  const path = resolveLauncherCommandCachePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  cache = data;
}

export function invalidateLauncherCommandCache(): void {
  cache = null;
}

export function matchLauncherCommandCache(userText: string): ReturnType<
  typeof matchLauncherCommandCacheEntries
> {
  return matchLauncherCommandCacheEntries(
    userText,
    loadLauncherCommandCache().entries,
  );
}

export function recordLauncherCommandCacheHits(ids: string[]): void {
  if (ids.length === 0) return;
  const data = loadLauncherCommandCache();
  const idSet = new Set(ids);
  const now = new Date().toISOString();
  let changed = false;

  const entries = data.entries.map((entry) => {
    if (!idSet.has(entry.id)) return entry;
    changed = true;
    return {
      ...entry,
      useCount: entry.useCount + 1,
      lastUsedAt: now,
    };
  });

  if (changed) {
    saveLauncherCommandCache({ ...data, entries });
  }
}

export async function buildLauncherCommandCachePromptBlock(
  userText: string,
): Promise<string | undefined> {
  const matches = matchLauncherCommandCache(userText);
  const block = formatLauncherCommandCachePromptBlock(matches);
  if (block && matches.length > 0) {
    recordLauncherCommandCacheHits(matches.map((item) => item.entry.id));
  }
  return block;
}

export function extractLastUserMessageText(messages: AgentUIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const parts: string[] = [];
    for (const part of message.parts) {
      if (isTextUIPart(part) && part.text.trim()) {
        parts.push(part.text);
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

export type SaveLauncherCommandInput = {
  trigger: string;
  steps: LauncherCachedToolStep[];
  aliases?: string[];
  note?: string;
};

export function saveLauncherCommandCacheEntry(
  input: SaveLauncherCommandInput,
): { ok: true; entry: LauncherCommandCacheEntry } | { ok: false; error: string } {
  const trigger = input.trigger.trim();
  if (trigger.length < 2) {
    return { ok: false, error: "trigger must be at least 2 characters" };
  }

  const steps = normalizeSteps(input.steps);
  if (steps.length === 0) {
    return {
      ok: false,
      error: "steps must include at least one allowed launcher tool call",
    };
  }

  const data = loadLauncherCommandCache();
  const triggerNorm = normalizeLauncherCommandPhrase(trigger);
  const now = new Date().toISOString();

  const existingIndex = data.entries.findIndex(
    (entry) => normalizeLauncherCommandPhrase(entry.trigger) === triggerNorm,
  );

  if (existingIndex >= 0) {
    const prev = data.entries[existingIndex]!;
    const updated: LauncherCommandCacheEntry = {
      ...prev,
      trigger,
      aliases: normalizeAliases(input.aliases) ?? prev.aliases,
      steps,
      note: input.note?.trim() || prev.note,
      updatedAt: now,
    };
    const entries = [...data.entries];
    entries[existingIndex] = updated;
    saveLauncherCommandCache({ ...data, entries });
    return { ok: true, entry: updated };
  }

  const entry: LauncherCommandCacheEntry = {
    id: newRandomId(),
    trigger,
    aliases: normalizeAliases(input.aliases),
    steps,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  };

  let entries = [...data.entries, entry];
  if (entries.length > MAX_ENTRIES) {
    entries = entries
      .sort((a, b) => {
        const aTime = a.lastUsedAt ?? a.updatedAt;
        const bTime = b.lastUsedAt ?? b.updatedAt;
        return aTime.localeCompare(bTime);
      })
      .slice(entries.length - MAX_ENTRIES);
  }

  saveLauncherCommandCache({ ...data, entries });
  return { ok: true, entry };
}

export function deleteLauncherCommandCacheEntry(
  id: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: "id is required" };

  const data = loadLauncherCommandCache();
  const next = data.entries.filter((entry) => entry.id !== trimmed);
  if (next.length === data.entries.length) {
    return { ok: false, error: `entry not found: ${trimmed}` };
  }
  saveLauncherCommandCache({ ...data, entries: next });
  return { ok: true };
}

export function listLauncherCommandCacheEntries(): LauncherCommandCacheEntry[] {
  return loadLauncherCommandCache().entries
    .slice()
    .sort((a, b) => {
      const aTime = a.lastUsedAt ?? a.updatedAt;
      const bTime = b.lastUsedAt ?? b.updatedAt;
      return bTime.localeCompare(aTime);
    });
}

export function getLauncherCommandCacheEntry(
  id: string,
): LauncherCommandCacheEntry | undefined {
  return loadLauncherCommandCache().entries.find((entry) => entry.id === id.trim());
}
