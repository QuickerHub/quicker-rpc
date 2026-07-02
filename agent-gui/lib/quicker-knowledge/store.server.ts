import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import type {
  QuickerKnowledgeChunk,
  QuickerKnowledgeSourceType,
} from "@/lib/quicker-knowledge/types";

const REQUIRED_STRING_KEYS = [
  "id",
  "pageId",
  "url",
  "title",
  "sourceType",
  "text",
  "contentHash",
] as const;

const ALLOWED_SOURCE_TYPES = new Set<QuickerKnowledgeSourceType>([
  "manual",
  "action_dev",
  "kb",
  "docs_index",
  "unknown",
]);

export function resolveDefaultQuickerKnowledgeChunksPath(): string {
  const configured = process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH?.trim();
  if (configured) {
    return configured;
  }

  return join(resolveAgentGuiRoot(), "data/quicker-knowledge/chunks.jsonl");
}

export function hasQuickerKnowledgeCorpus(
  filePath = resolveDefaultQuickerKnowledgeChunksPath(),
): boolean {
  return existsSync(filePath);
}

export async function loadQuickerKnowledgeChunksFromJsonl(
  filePath = resolveDefaultQuickerKnowledgeChunksPath(),
): Promise<QuickerKnowledgeChunk[]> {
  const content = await readFile(filePath, "utf8");
  const chunks: QuickerKnowledgeChunk[] = [];
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    const record = parseRecord(line, lineNumber);
    chunks.push(validateChunkRecord(record, lineNumber));
  }

  return chunks;
}

function parseRecord(line: string, lineNumber: number): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error(`Invalid quicker knowledge chunk at line ${lineNumber}: malformed JSON`, {
      cause: error,
    });
  }
}

function validateChunkRecord(record: unknown, lineNumber: number): QuickerKnowledgeChunk {
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    throw invalidRecord(lineNumber, "record must be an object");
  }

  const chunk = record as Record<string, unknown>;
  for (const key of REQUIRED_STRING_KEYS) {
    if (typeof chunk[key] !== "string") {
      throw invalidRecord(lineNumber, `${key} must be a string`);
    }
  }

  if (
    !Array.isArray(chunk.sectionPath) ||
    !chunk.sectionPath.every((item) => typeof item === "string")
  ) {
    throw invalidRecord(lineNumber, "sectionPath must be an array of strings");
  }

  const sourceType = chunk.sourceType as string;
  if (!isQuickerKnowledgeSourceType(sourceType)) {
    throw invalidRecord(lineNumber, "sourceType must be one of: manual, action_dev, kb, docs_index, unknown");
  }

  const text = chunk.text as string;
  const tokenEstimate =
    typeof chunk.tokenEstimate === "number" && Number.isFinite(chunk.tokenEstimate)
      ? chunk.tokenEstimate
      : Math.ceil(text.length / 3);

  return {
    id: chunk.id as string,
    pageId: chunk.pageId as string,
    url: chunk.url as string,
    title: chunk.title as string,
    sectionPath: chunk.sectionPath as string[],
    sourceType,
    text,
    tokenEstimate,
    contentHash: chunk.contentHash as string,
  };
}

function isQuickerKnowledgeSourceType(value: string): value is QuickerKnowledgeSourceType {
  return ALLOWED_SOURCE_TYPES.has(value as QuickerKnowledgeSourceType);
}

function invalidRecord(lineNumber: number, reason: string): Error {
  return new Error(`Invalid quicker knowledge chunk at line ${lineNumber}: ${reason}`);
}
