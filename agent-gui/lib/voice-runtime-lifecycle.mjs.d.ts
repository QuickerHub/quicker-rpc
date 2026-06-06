import type { ChildProcess } from "node:child_process";

export type VoiceRuntimeState = {
  pid: number;
  port?: number;
  ownerPid: number;
  startedAt: number;
};

export function voiceRuntimeStatePath(agentGuiRoot: string): string;
export function readVoiceRuntimeState(agentGuiRoot: string): VoiceRuntimeState | null;
export function writeVoiceRuntimeState(agentGuiRoot: string, state: VoiceRuntimeState): void;
export function clearVoiceRuntimeState(agentGuiRoot: string): void;
export function resolveVoicePort(): number;
export function checkVoiceRuntimeHealth(base: string, timeoutMs?: number): Promise<boolean>;
export function checkVoiceRuntimeProtocol(base: string, timeoutMs?: number): Promise<boolean>;
export function reconcileStaleVoiceRuntime(agentGuiRoot: string): void;
export function trackVoiceRuntimeChild(
  agentGuiRoot: string,
  child: ChildProcess,
  meta?: Record<string, unknown>,
): void;
export function stopTrackedVoiceRuntime(agentGuiRoot: string, child: ChildProcess): void;
export function ensureVoiceRuntime(
  agentGuiRoot: string,
  host: string,
): Promise<ChildProcess | null>;
