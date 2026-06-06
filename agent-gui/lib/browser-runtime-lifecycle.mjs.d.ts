import type { ChildProcess } from "node:child_process";

export type BrowserRuntimeState = {
  pid: number;
  port?: number;
  ownerPid: number;
  startedAt: number;
};

export function browserRuntimeStatePath(agentGuiRoot: string): string;
export function readBrowserRuntimeState(agentGuiRoot: string): BrowserRuntimeState | null;
export function writeBrowserRuntimeState(agentGuiRoot: string, state: BrowserRuntimeState): void;
export function clearBrowserRuntimeState(agentGuiRoot: string): void;
export function resolveBrowserPort(): number;
export function checkBrowserRuntimeHealth(base: string, timeoutMs?: number): Promise<boolean>;
export function reconcileStaleBrowserRuntime(agentGuiRoot: string): void;
export function trackBrowserRuntimeChild(
  agentGuiRoot: string,
  child: ChildProcess,
  meta?: Record<string, unknown>,
): void;
export function stopTrackedBrowserRuntime(agentGuiRoot: string, child: ChildProcess): void;
export function ensureBrowserRuntime(
  agentGuiRoot: string,
  host: string,
): Promise<ChildProcess | null>;
