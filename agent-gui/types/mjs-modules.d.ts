declare module "@/lib/qkrpc-serve-ensure.mjs" {
  /** Start bundled qkrpc serve when /health is unreachable. Returns true when serve responds. */
  export function ensureQkrpcServeIfDown(): Promise<boolean>;
}

declare module "@/lib/qkrpc-serve-discover.mjs" {
  export function isQkrpcServeHealthy(base: string, timeoutMs?: number, abortSignal?: AbortSignal): Promise<boolean>;
  export function discoverHealthyQkrpcServe(
    host?: string,
    scanFromPort?: number,
    maxPorts?: number,
    abortSignal?: AbortSignal,
  ): Promise<{ baseUrl: string; port: number } | null>;
}

declare module "@/lib/cursor-sdk-runtime-lifecycle.mjs" {
  export type CursorSdkRuntimeHealth = {
    ok: boolean;
    runtimeVersion?: string;
    protocolVersion?: string;
  };

  export function resolveCursorSdkPort(): number;
  export function fetchCursorSdkRuntimeHealth(
    base: string,
    timeoutMs?: number,
  ): Promise<CursorSdkRuntimeHealth>;
  export function ensureCursorSdkRuntime(
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

  export type BrowserRuntimeHealth = {
    ok: boolean;
    runtimeOwner?: string;
    runtimeVersion?: string;
    protocolVersion?: string;
  };

  export function browserRuntimeStatePath(agentGuiRoot: string): string;
  export function readBrowserRuntimeState(agentGuiRoot: string): BrowserRuntimeState | null;
  export function writeBrowserRuntimeState(agentGuiRoot: string, state: BrowserRuntimeState): void;
  export function clearBrowserRuntimeState(agentGuiRoot: string): void;
  export function resolveBrowserPort(): number;
  export function fetchBrowserRuntimeHealth(
    base: string,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<BrowserRuntimeHealth>;
  export function checkBrowserRuntimeHealth(base: string, timeoutMs?: number): Promise<boolean>;
  export function isBrowserRuntimeVersionCurrent(health: BrowserRuntimeHealth): boolean;
  export function killListenerOnPort(port: number): void;
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
  export function stopOwnedBrowserRuntimes(): Promise<void>;
  export function ensureBrowserRuntime(
    agentGuiRoot: string,
    host: string,
  ): Promise<import("node:child_process").ChildProcess | null>;
}

declare module "@/lib/terminal-runtime-lifecycle.mjs" {
  export type TerminalRuntimeState = {
    pid: number;
    port?: number;
    ownerPid: number;
    startedAt: number;
  };

  export type TerminalRuntimeHealth = {
    ok: boolean;
    runtimeVersion?: string;
    protocolVersion?: string;
  };

  export function terminalRuntimeStatePath(agentGuiRoot: string): string;
  export function readTerminalRuntimeState(agentGuiRoot: string): TerminalRuntimeState | null;
  export function writeTerminalRuntimeState(
    agentGuiRoot: string,
    state: TerminalRuntimeState,
  ): void;
  export function clearTerminalRuntimeState(agentGuiRoot: string): void;
  export function resolveTerminalRuntimeRoot(agentGuiRoot: string): string;
  export function resolveTerminalPort(): number;
  export function fetchTerminalRuntimeHealth(
    base: string,
    timeoutMs?: number,
  ): Promise<TerminalRuntimeHealth>;
  export function checkTerminalRuntimeHealth(base: string, timeoutMs?: number): Promise<boolean>;
  export function isTerminalRuntimeVersionCurrent(health: TerminalRuntimeHealth): boolean;
  export function reconcileStaleTerminalRuntime(agentGuiRoot: string): void;
  export function trackTerminalRuntimeChild(
    agentGuiRoot: string,
    child: import("node:child_process").ChildProcess,
    meta?: Record<string, unknown>,
  ): void;
  export function stopTrackedTerminalRuntime(
    agentGuiRoot: string,
    child: import("node:child_process").ChildProcess,
  ): void;
  export function stopOwnedTerminalRuntimes(): Promise<void>;
  export function ensureTerminalRuntime(
    agentGuiRoot: string,
    host: string,
  ): Promise<import("node:child_process").ChildProcess | null>;
}
