import type { AgentUIMessage } from "@/lib/chat-types";
import { AGENT_ARTIFACT_DIR } from "@/lib/agent-harness/tool-execution-context";
import {
  getRequestArtifactDir,
  getRequestThreadId,
} from "@/lib/qkrpc-request-context";
import { writeWorkspaceFile } from "@/lib/workspace-fs";
import {
  AGENT_HISTORY_FORMAT,
  AGENT_ARTIFACT_FORMAT_SHELL,
  SHELL_ARTIFACT_TAIL_CHARS,
  SHELL_ARTIFACT_THRESHOLD_CHARS,
  type AgentArtifactRef,
  type ShellArtifactPayload,
} from "@/lib/agent-harness/artifacts/types";

export {
  SHELL_ARTIFACT_THRESHOLD_CHARS,
  SHELL_ARTIFACT_TAIL_CHARS,
} from "@/lib/agent-harness/artifacts/types";

function sanitizeArtifactSegment(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "artifact";
}

function resolveArtifactRoot(explicit?: string): string {
  const trimmed = explicit?.trim() || getRequestArtifactDir()?.trim();
  return trimmed || AGENT_ARTIFACT_DIR;
}

function resolveThreadSegment(explicit?: string): string {
  return sanitizeArtifactSegment(explicit ?? getRequestThreadId() ?? "anon");
}

export function buildShellArtifactRelativePath(options?: {
  toolCallId?: string;
  threadId?: string;
  artifactDir?: string;
}): string {
  const root = resolveArtifactRoot(options?.artifactDir);
  const thread = resolveThreadSegment(options?.threadId);
  const id = sanitizeArtifactSegment(options?.toolCallId ?? `shell-${Date.now()}`);
  return `${root}/${thread}/${id}.txt`;
}

export function buildAgentHistoryRelativePath(
  threadId: string | undefined,
  timestampMs: number,
): string {
  const thread = sanitizeArtifactSegment(threadId ?? "anon");
  return `.local/agent-history/${thread}/${timestampMs}.jsonl`;
}

export async function attachShellOutputArtifact(
  combinedOutput: string,
  options?: { toolCallId?: string; threadId?: string; artifactDir?: string },
): Promise<ShellArtifactPayload | null> {
  const output = combinedOutput.trimEnd();
  if (output.length < SHELL_ARTIFACT_THRESHOLD_CHARS) return null;

  const relativePath = buildShellArtifactRelativePath(options);
  const writeResult = await writeWorkspaceFile(relativePath, output);
  if (!writeResult.ok) return null;

  const tailPreview = output.slice(-SHELL_ARTIFACT_TAIL_CHARS);
  const artifactRef: AgentArtifactRef = {
    path: writeResult.path,
    format: AGENT_ARTIFACT_FORMAT_SHELL,
    bytesWritten: writeResult.bytesWritten,
  };

  return {
    artifactRef,
    tailPreview,
    totalOutputChars: output.length,
    readHint:
      `Full output saved to ${writeResult.path}. `
      + "Read with offset/limit or Grep that path for details.",
  };
}

/** Persist pre-compression message slice for later grep/Read recovery. */
export async function writeAgentHistoryArtifact(
  messages: AgentUIMessage[],
  options?: { threadId?: string; timestampMs?: number },
): Promise<AgentArtifactRef | null> {
  if (messages.length === 0) return null;

  const timestampMs = options?.timestampMs ?? Date.now();
  const threadId = options?.threadId ?? getRequestThreadId();
  const relativePath = buildAgentHistoryRelativePath(threadId, timestampMs);
  const body = messages.map((message) => JSON.stringify(message)).join("\n");
  const writeResult = await writeWorkspaceFile(relativePath, body);
  if (!writeResult.ok) return null;

  return {
    path: writeResult.path,
    format: AGENT_HISTORY_FORMAT,
    bytesWritten: writeResult.bytesWritten,
  };
}
