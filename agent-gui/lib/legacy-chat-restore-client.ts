"use client";

import type { ChatStoreData } from "@/lib/chat-store";
import {
  assembleChatStoreCandidatesFromLegacyHits,
  type LegacyScanHit,
} from "@/lib/legacy-chat-assemble";
import { invokeDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";

export type LegacyDiskScanResult = {
  candidates: Array<{ source: string; data: ChatStoreData }>;
  scannedRoots: string[];
};

export async function fetchLegacyChatStoreCandidatesFromDisk(): Promise<LegacyDiskScanResult> {
  let hits: LegacyScanHit[] = [];
  let scannedRoots: string[] = [];

  if (isDesktopShell()) {
    try {
      const dto = await invokeDesktop<{ hits: LegacyScanHit[]; scannedRoots: string[] }>(
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

  const assembled = assembleChatStoreCandidatesFromLegacyHits(hits);
  const candidates: Array<{ source: string; data: ChatStoreData }> = [];
  const seenThreadSets = new Set<string>();

  for (const item of assembled) {
    const signature = item.data.threads
      .filter((t) => t.messages.length > 0)
      .map((t) => `${t.id}:${t.messages.length}`)
      .sort()
      .join("|");
    if (!signature || seenThreadSets.has(signature)) continue;
    seenThreadSets.add(signature);
    candidates.push(item);
  }

  return { candidates, scannedRoots };
}
