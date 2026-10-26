import "server-only";
import { resolve } from "node:path";
import { argvToInvoke } from "./qkrpc-argv";
import { currentQkrpcTarget, bindingFailure, readHostBinding, sameHostBinding } from "./qkrpc-host-binding";
import { getRequestTurnExecutionState } from "./qkrpc-request-context";
import { resolveRequestAbortSignal } from "./request-abort-signal";
import { invokeQkrpcHttp } from "./qkrpc-http";
import { resolveQkrpcCliBinary, runQkrpcCliDirect, type QkrpcRunOptions } from "./qkrpc";
import { executeSingleQkrpcToolCall } from "./qkrpc-tool-call";
import { isQkrpcConnectivityBlockedThisTurn, markQkrpcConnectivityBlockedThisTurn } from "./qkrpc-connectivity-gate";
import type { QkrpcRunResult } from "./qkrpc-types";
import { STEP_RUNNER_SCHEMA_READ_FORMAT } from "./step-runner-schema-read";

type SchemaReadPorts = {
  http: typeof invokeQkrpcHttp;
  cli: typeof runQkrpcCliDirect;
  binary: typeof resolveQkrpcCliBinary;
};

/** A schema page observes the selected connection once; it never recovers or switches it. */
export function createQkrpcSchemaReadRunner(ports: Partial<SchemaReadPorts> = {}) {
  const http = ports.http ?? invokeQkrpcHttp;
  const cli = ports.cli ?? runQkrpcCliDirect;
  const binary = ports.binary ?? resolveQkrpcCliBinary;
  return async (args: string[], options: QkrpcRunOptions = {}): Promise<QkrpcRunResult> => {
    const abortSignal = resolveRequestAbortSignal(options.abortSignal);
    abortSignal?.throwIfAborted();
    const invoke = argvToInvoke(args);
    if (invoke?.op !== "step-runner.get" || !invoke.args.read || typeof invoke.args.read !== "object"
      || Array.isArray(invoke.args.read) || typeof invoke.args.key !== "string" || !invoke.args.key.trim()
      || (invoke.args.controlField !== undefined && typeof invoke.args.controlField !== "string") || options.stdin) {
      return bindingFailure("SCHEMA_READ_INVALID", "Only a StepRunner schema page with explicit read parameters is permitted.");
    }

    const state = getRequestTurnExecutionState();
    const target = currentQkrpcTarget();
    const binding = readHostBinding(target?.binding);
    if (!state || state.closed || !target || !binding) {
      return bindingFailure("HOST_BINDING_REQUIRED", "Select the current host with a module search/get before reading schema pages. No connection was attempted.");
    }
    if (options.hostBinding && !sameHostBinding(options.hostBinding, binding)) {
      return bindingFailure("HOST_BINDING_MISMATCH", "Schema pages must use this turn's selected host. No connection was attempted.");
    }
    const identity = JSON.stringify(binding);
    const ownsTarget = () => !state.closed && getRequestTurnExecutionState() === state
      && currentQkrpcTarget() === target && JSON.stringify(target.binding) === identity;
    const changed = () => bindingFailure("HOST_BINDING_MISMATCH", "The schema page owner changed; discard this result and read from the selected host again.");

    // Rebuild the command so callers cannot override the connection-only flag or inject another operation.
    const readArgs = ["step-runner", "get", "--key", invoke.args.key.trim(), "--schema-read", JSON.stringify(invoke.args.read)];
    if (typeof invoke.args.controlField === "string") readArgs.push("--control-field-json", JSON.stringify(invoke.args.controlField));
    readArgs.push("--no-bootstrap");
    const result = await executeSingleQkrpcToolCall(readArgs, { timeoutMs: options.timeoutMs, abortSignal }, {
      isConnectivityBlocked: isQkrpcConnectivityBlockedThisTurn,
      markConnectivityBlocked: markQkrpcConnectivityBlockedThisTurn,
      run: async () => {
        abortSignal?.throwIfAborted();
        if (!ownsTarget()) return changed();
        if (target.gateway !== "cli") {
          // Supplying both values disables HTTP alignment/discovery and forbids a CLI fallback.
          return await http(invoke, { timeoutMs: options.timeoutMs, abortSignal, hostBinding: binding, gatewayBase: target.gateway })
            ?? bindingFailure("HOST_UNAVAILABLE", "The selected schema gateway is unavailable. No other connection was attempted.");
        }
        const binaryPath = binary({ readOnly: true });
        abortSignal?.throwIfAborted();
        if (!ownsTarget()) return changed();
        if (!binaryPath) return bindingFailure("SCHEMA_READ_CLI_UNAVAILABLE", "The selected CLI executable is unavailable. No files were staged and no other connection was attempted.");
        return cli(readArgs, { binaryPath: resolve(binaryPath), timeoutMs: options.timeoutMs, abortSignal, hostBinding: binding, json: true });
      },
    });
    abortSignal?.throwIfAborted();
    if (!ownsTarget()) return changed();
    if (result.truncated) return bindingFailure("SCHEMA_READ_TRUNCATED", "The schema page transport was truncated; no content or continuation is usable.");
    if (result.ok) {
      const root = result.parsed && typeof result.parsed === "object" ? result.parsed as Record<string, unknown> : undefined;
      const payload = root?.payload && typeof root.payload === "object" ? root.payload as Record<string, unknown> : undefined;
      const page = payload?.schemaRead && typeof payload.schemaRead === "object" ? payload.schemaRead as Record<string, unknown> : undefined;
      if (root?.action !== "step-runner-get" || page?.format !== STEP_RUNNER_SCHEMA_READ_FORMAT
        || !["available", "unavailable"].includes(String(page.status))) {
        return bindingFailure("SCHEMA_READ_UNSUPPORTED", "The selected CLI/gateway did not return the schema page contract. No ordinary schema was treated as a page.");
      }
      if (root.ok === false || payload?.success === false || page.status === "unavailable") {
        return { ...result, ok: false, exitCode: result.exitCode === 0 ? 1 : result.exitCode };
      }
    }
    return result;
  };
}

export const runQkrpcSchemaReadForTool = createQkrpcSchemaReadRunner();
