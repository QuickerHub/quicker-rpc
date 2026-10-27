import type { EventEmitter } from "node:events";

export type OwnedServiceStartupProcess = Pick<EventEmitter, "on" | "off"> & {
  connected?: boolean;
  disconnect?: () => void;
};

/** Owns startup through shutdown; a late startup result is always retained and stopped. */
export async function runOwnedServiceStartup<T extends { stop(): void | Promise<void> }>(options: {
  process: OwnedServiceStartupProcess;
  start: (signal: AbortSignal) => T | Promise<T>;
  onReady: (service: T) => void;
}): Promise<void> {
  const parent = options.process;
  const controller = new AbortController();
  const cancellation = new DOMException("Agent service shutdown requested", "AbortError");
  let requested = false;
  let resolveStop!: () => void;
  const stopRequested = new Promise<void>((resolve) => { resolveStop = resolve; });
  const requestStop = () => {
    if (requested) return;
    requested = true;
    resolveStop();
    controller.abort(cancellation);
  };
  const onMessage = (message: unknown) => { if (message === "shutdown") requestStop(); };
  const listeners: Array<[string, (...args: unknown[]) => void]> = [];
  const listen = (name: string, handler: (...args: unknown[]) => void) => {
    listeners.push([name, handler]);
    parent.on(name, handler);
  };
  const errors: unknown[] = [];
  let service: T | undefined;
  try {
    listen("SIGINT", requestStop);
    listen("SIGTERM", requestStop);
    if (typeof parent.connected === "boolean") {
      listen("message", onMessage);
      listen("disconnect", requestStop);
    }
    // A disconnect emitted before this module entered cannot be replayed by Node.
    if (parent.connected === false) requestStop();
    // Node delivers buffered IPC messages on a real nextTick/turn, after listener setup.
    // A resolved Promise alone can continue first when this entry runs as ESM.
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.signal.throwIfAborted();
    service = await options.start(controller.signal);
    if (!requested) {
      options.onReady(service);
      await stopRequested;
    }
  } catch (error) {
    if (!(controller.signal.aborted && error === controller.signal.reason)) errors.push(error);
  } finally {
    // Handlers only latch a request; this single serial owner performs stop exactly once.
    if (service) {
      try { await service.stop(); } catch (error) { errors.push(error); }
    }
    for (const [name, handler] of listeners) {
      try { parent.off(name, handler); } catch (error) { errors.push(error); }
    }
    if (parent.connected === true) {
      try {
        if (!parent.disconnect) throw new Error("Owned service IPC has no disconnect operation");
        parent.disconnect();
      } catch (error) { errors.push(error); }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Agent service lifecycle failed");
}
