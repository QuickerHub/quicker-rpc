import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";
type TerminalRuntimeLifecycle = Pick<typeof import("@/lib/terminal-runtime-lifecycle.mjs"),
  "checkTerminalRuntimeHealth" | "ensureTerminalRuntime" | "resolveTerminalPort">;

type TerminalRuntimeStartDependencies = {
  env?: NodeJS.ProcessEnv;
  cwd?: () => string;
  loadLifecycle?: () => Promise<TerminalRuntimeLifecycle>;
};

/** Lazy-start Node terminal-runtime (dev + bundled QuickerAgent). */
export function createStartTerminalRuntimeHandler({
  env = process.env,
  cwd = () => process.cwd(),
  loadLifecycle = () => import("@/lib/terminal-runtime-lifecycle.mjs"),
}: TerminalRuntimeStartDependencies = {}) {
  return async function startTerminalRuntimeHandler(): Promise<Response> {
    if (env.AGENT_GUI_SKIP_TERMINAL_RUNTIME === "1") {
      return Response.json(
        {
          ok: false,
          message: "terminal runtime disabled (AGENT_GUI_SKIP_TERMINAL_RUNTIME=1)",
        },
        { status: 503 },
      );
    }

    const host = env.HOSTNAME?.trim() || "127.0.0.1";
    const {
      checkTerminalRuntimeHealth,
      ensureTerminalRuntime,
      resolveTerminalPort,
    } = await loadLifecycle();

    const port = resolveTerminalPort();
    const base = runtimeHttpOrigin(host, port);

    const child = await ensureTerminalRuntime(cwd(), host);
    if (!(await checkTerminalRuntimeHealth(base))) {
      return Response.json(
        {
          ok: false,
          message:
            `terminal runtime not ready at ${base}. `
            + "Ensure node-pty is installed (pnpm install).",
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: true,
      reused: !child,
      started: Boolean(child),
      base,
      port,
      ...(env.QUICKER_AGENT_RUNTIME_OWNER ? { runtimeOwner: env.QUICKER_AGENT_RUNTIME_OWNER } : {}),
    });
  };
}

export const startTerminalRuntimeHandler = createStartTerminalRuntimeHandler();
