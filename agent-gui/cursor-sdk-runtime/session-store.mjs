import { Agent } from "@cursor/sdk";
import { quickerRpcAgentOptions } from "./agent-config.mjs";

/** @type {Map<string, { id: string; agent: import("@cursor/sdk").SDKAgent; cwd: string; modelId: string; agentId: string; createdAt: number }>} */
const sessions = new Map();

export function listSessionIds() {
  return [...sessions.keys()];
}

/** @param {string} sessionId */
export async function disposeSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (!existing) return false;
  sessions.delete(sessionId);
  try {
    await existing.agent[Symbol.asyncDispose]();
  } catch {
    // best effort
  }
  return true;
}

export async function disposeAllSessions() {
  const ids = listSessionIds();
  await Promise.all(ids.map((id) => disposeSession(id)));
}

/** @param {{ sessionId: string; cwd: string; modelId: string; forceNew?: boolean }} params */
export async function getOrCreateSession(params) {
  const existing = sessions.get(params.sessionId);
  if (
    existing
    && !params.forceNew
    && existing.cwd === params.cwd
    && existing.modelId === params.modelId
  ) {
    return existing;
  }

  if (existing) {
    await disposeSession(params.sessionId);
  }

  const agent = await Agent.create(
    quickerRpcAgentOptions({
      cwd: params.cwd,
      modelId: params.modelId,
      name: `cursor-sdk-ui-${params.sessionId.slice(0, 8)}`,
    }),
  );

  const session = {
    id: params.sessionId,
    agent,
    cwd: params.cwd,
    modelId: params.modelId,
    agentId: agent.agentId,
    createdAt: Date.now(),
  };
  sessions.set(params.sessionId, session);
  return session;
}
