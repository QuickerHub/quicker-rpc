import type { AgentServiceRuntime } from "./application";

type RuntimeResources = {
  runTurn: AgentServiceRuntime["runTurn"];
  handleRequest?: AgentServiceRuntime["handleRequest"];
  closeDatabase: () => void | Promise<void>;
  stopBrowserRuntimes: () => void | Promise<void>;
  stopTerminalRuntimes: () => void | Promise<void>;
  stopBackgroundTasks?: () => void | Promise<void>;
};

/** Each production service process has one loader and one set of process resources. */
export function createAgentRuntimeLoader(loadResources: () => Promise<RuntimeResources>) {
  let owned = false;
  return async (): Promise<AgentServiceRuntime> => {
    if (owned) throw new Error("An Agent runtime already owns this service process");
    owned = true;
    let resources: RuntimeResources;
    try { resources = await loadResources(); }
    catch (error) { owned = false; throw error; }
    let disposing: Promise<void> | undefined;
    return {
      runTurn: resources.runTurn,
      handleRequest: resources.handleRequest,
      dispose: () => disposing ??= (async () => {
        const results = await Promise.allSettled([
          Promise.resolve().then(resources.stopBrowserRuntimes),
          Promise.resolve().then(resources.stopTerminalRuntimes),
          Promise.resolve().then(resources.stopBackgroundTasks),
        ]);
        results.push(await Promise.resolve().then(resources.closeDatabase).then(
          () => ({ status: "fulfilled" as const, value: undefined }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        ));
        const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
        if (errors.length) throw new AggregateError(errors.map((result) => result.reason), "Agent runtime cleanup failed");
        owned = false;
      })(),
    };
  };
}

/** Real adapters load on the first chat, never during /health or CLI --help. */
export const loadProductionAgentRuntime = createAgentRuntimeLoader(async () => {
  const [runner, database, browser, terminal, api, remoteConfig, manualTrace] = await Promise.all([
    import("../agent-harness/run-turn.server"),
    import("../db/client"),
    import("@/lib/browser-runtime-lifecycle.mjs"),
    import("@/lib/terminal-runtime-lifecycle.mjs"),
    import("./api-router"),
    import("../llm-remote-publish-config"),
    import("../action-trace-manual.server"),
  ]);
  remoteConfig.startRemotePublishConfigRefreshOwner();
  return {
    runTurn: runner.runAgentChatTurn,
    handleRequest: api.handleAgentApiRequest,
    closeDatabase: database.closeAgentDatabase,
    stopBrowserRuntimes: browser.stopOwnedBrowserRuntimes,
    stopTerminalRuntimes: terminal.stopOwnedTerminalRuntimes,
    stopBackgroundTasks: async () => {
      const results = await Promise.allSettled([remoteConfig.stopRemotePublishConfigRefreshes(), manualTrace.stopManualTraceRuns()]);
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (errors.length) throw new AggregateError(errors.map((result) => result.reason), "Background task cleanup failed");
    },
  };
});
