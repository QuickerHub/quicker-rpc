import type { UIMessage } from "ai";
import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
} from "ai";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { USER_BROWSER_TOOL } from "@/lib/qkrpc-chrome-tool";
import {
  parseSnapshotRefMap,
  refTargetFromSearchMatches,
} from "@/lib/browser-to-action/snapshot-parse";
import type { BrowserRecordingEntry, RefTargetHint } from "@/lib/browser-to-action/types";
import { isStructuredToolResult } from "@/lib/tool-result";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function readToolData(output: unknown): Record<string, unknown> | null {
  if (!isStructuredToolResult(output)) return null;
  return asRecord(output.data);
}

/** In-memory browser call log keyed by browser sessionId (often thread id). */
const sessionRecordings = new Map<string, BrowserRecordingEntry[]>();

export function appendBrowserRecording(
  sessionId: string,
  entry: BrowserRecordingEntry,
): void {
  const key = sessionId.trim() || "default";
  const list = sessionRecordings.get(key) ?? [];
  list.push(entry);
  sessionRecordings.set(key, list);
}

export function getBrowserRecordings(sessionId: string): BrowserRecordingEntry[] {
  return [...(sessionRecordings.get(sessionId.trim() || "default") ?? [])];
}

export function clearBrowserRecordings(sessionId: string): void {
  sessionRecordings.delete(sessionId.trim() || "default");
}

export function buildRecordingFromBrowserCall(
  input: Record<string, unknown>,
  output?: unknown,
  refMap?: Map<string, RefTargetHint>,
): BrowserRecordingEntry {
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  let refTarget = ref && refMap ? refMap.get(ref) : undefined;

  const data = output ? readToolData(output) : null;
  if (!refTarget && ref && data?.matches) {
    refTarget = refTargetFromSearchMatches(data.matches, ref);
  }
  if (!refTarget && ref && typeof data?.snapshot === "string") {
    refTarget = parseSnapshotRefMap(data.snapshot).get(ref);
  }

  const selector = typeof input.selector === "string" ? input.selector : undefined;

  return {
    source: "browser",
    input,
    ...(refTarget ? { refTarget } : {}),
    ...(selector ? { selector } : {}),
  };
}

export function buildRecordingFromUserBrowserCall(
  input: Record<string, unknown>,
): BrowserRecordingEntry {
  return { source: "user_browser", input };
}

/** Extract browser + user_browser recordings from chat messages (current user turn onward). */
export function extractBrowserRecordingsFromMessages(
  messages: UIMessage[],
): BrowserRecordingEntry[] {
  const entries: BrowserRecordingEntry[] = [];
  let refMap = new Map<string, RefTargetHint>();

  let startIndex = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      startIndex = i;
      break;
    }
  }

  for (let i = startIndex; i < messages.length; i += 1) {
    const message = messages[i]!;
    if (message.role !== "assistant") continue;

    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      if (part.state !== "output-available") continue;

      const toolName = getToolOrDynamicToolName(part);
      const input = asRecord(part.input);
      if (!input) continue;

      if (toolName === BROWSER_TOOL) {
        const output = part.output;
        const data = readToolData(output);
        if (data?.snapshot && typeof data.snapshot === "string") {
          refMap = parseSnapshotRefMap(data.snapshot);
        }
        if (data?.matches) {
          for (const match of data.matches as unknown[]) {
            if (typeof match !== "object" || match === null) continue;
            const row = match as Record<string, unknown>;
            const ref = typeof row.ref === "string" ? row.ref : "";
            const role = typeof row.role === "string" ? row.role : "generic";
            const name =
              typeof row.name === "string"
                ? row.name
                : typeof row.text === "string"
                  ? row.text
                  : null;
            const nth = typeof row.nth === "number" ? row.nth : 0;
            if (ref) refMap.set(ref, { role, name, nth });
          }
        }
        entries.push(buildRecordingFromBrowserCall(input, output, refMap));
        continue;
      }

      if (toolName === USER_BROWSER_TOOL) {
        entries.push(buildRecordingFromUserBrowserCall(input));
      }
    }
  }

  return entries;
}
