"use client";

import type { ChatStoreData } from "@/lib/chat-store";
import { parseLegacyChatPayload } from "@/lib/chat-store";
import { isTauriShell } from "@/lib/tauri-shell";

type LegacyScanHit = {
  source: string;
  storageKey: string;
  json: string;
};

export type LegacyDiskScanResult = {
  candidates: Array<{ source: string; data: ChatStoreData }>;
  scannedRoots: string[];
};

export async function fetchLegacyChatStoreCandidatesFromDisk(): Promise<LegacyDiskScanResult> {
  let hits: LegacyScanHit[] = [];
  let scannedRoots: string[] = [];

  if (isTauriShell()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dto = await invoke<{ hits: LegacyScanHit[]; scannedRoots: string[] }>(
        "legacy_chat_store_scan",
      );
      hits = dto.hits ?? [];
      scannedRoots = dto.scannedRoots ?? [];
    } catch {
      /* fall through to HTTP */
    }
  }

  if (hits.length === 0 && scannedRoots.length === 0) {
    try {
      const res = await fetch("/api/chat-store/scan-legacy", {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          hits?: LegacyScanHit[];
          scannedRoots?: string[];
        };
        hits = data.hits ?? [];
        scannedRoots = data.scannedRoots ?? [];
      }
    } catch {
      /* optional disk scan */
    }
  }

  const candidates: Array<{ source: string; data: ChatStoreData }> = [];
  const seenThreadSets = new Set<string>();

  for (const hit of hits) {
    const parsed = parseLegacyChatPayload(hit.storageKey, hit.json);
    if (!parsed) continue;
    const signature = parsed.threads
      .filter((t) => t.messages.length > 0)
      .map((t) => `${t.id}:${t.messages.length}`)
      .sort()
      .join("|");
    if (!signature || seenThreadSets.has(signature)) continue;
    seenThreadSets.add(signature);
    candidates.push({ source: hit.source, data: parsed });
  }

  return { candidates, scannedRoots };
}
