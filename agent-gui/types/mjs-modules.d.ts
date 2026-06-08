declare module "@/lib/qkrpc-serve-ensure.mjs" {
  /** Start bundled qkrpc serve when /health is unreachable. Returns true when serve responds. */
  export function ensureQkrpcServeIfDown(): Promise<boolean>;
}

declare module "@/lib/voice-runtime-lifecycle.mjs" {
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
    child: import("node:child_process").ChildProcess,
    meta?: Record<string, unknown>,
  ): void;
  export function stopTrackedVoiceRuntime(
    agentGuiRoot: string,
    child: import("node:child_process").ChildProcess,
  ): void;
  export function stopVoiceRuntime(agentGuiRoot: string): void;
  export function ensureVoiceRuntime(
    agentGuiRoot: string,
    host: string,
  ): Promise<import("node:child_process").ChildProcess | null>;
}

declare module "@/lib/browser-runtime-lifecycle.mjs" {
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
    child: import("node:child_process").ChildProcess,
    meta?: Record<string, unknown>,
  ): void;
  export function stopTrackedBrowserRuntime(
    agentGuiRoot: string,
    child: import("node:child_process").ChildProcess,
  ): void;
  export function ensureBrowserRuntime(
    agentGuiRoot: string,
    host: string,
  ): Promise<import("node:child_process").ChildProcess | null>;
}
