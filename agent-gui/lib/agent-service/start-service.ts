import { createAgentServiceApplication, type AgentServiceApplicationOptions } from "./application";
import { startAgentNodeHttpService } from "./node-http";

/** Transport and runtime have separate owners; requests settle before storage closes. */
export async function startAgentService(
  options: AgentServiceApplicationOptions & {
    host?: string;
    port?: number;
    stopGraceMs?: number;
  },
) {
  const app = createAgentServiceApplication(options);
  let http: Awaited<ReturnType<typeof startAgentNodeHttpService>>;
  try {
    http = await startAgentNodeHttpService(app.handle, options);
  } catch (error) {
    await app.dispose();
    throw error;
  }
  let stopping: Promise<void> | undefined;
  return {
    origin: http.origin,
    address: http.address,
    stop(): Promise<void> {
      if (!stopping) {
        let resolveStop!: () => void;
        let rejectStop!: (error: unknown) => void;
        // Abort callbacks can synchronously reenter the public service owner.
        stopping = new Promise<void>((resolve, reject) => { resolveStop = resolve; rejectStop = reject; });
        try {
          void http.stop().then(() => app.dispose(), (error) => {
            // A non-cooperating request must not reopen storage after premature close.
            void http.whenSettled().then(() => app.dispose()).catch((cleanupError: unknown) => {
              try { options.onError?.(cleanupError); } catch { /* Best effort reporting. */ }
            });
            throw error;
          }).then(resolveStop, rejectStop);
        } catch (error) { rejectStop(error); }
      }
      return stopping;
    },
  };
}
