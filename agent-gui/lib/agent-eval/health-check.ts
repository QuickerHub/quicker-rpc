import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";

export type AgentEvalHealthResult = {
  ok: boolean;
  baseUrl: string;
  chatReachable: boolean;
  statusCode?: number;
  error?: string;
};

export async function checkAgentGuiHealth(
  baseUrl: string = defaultAgentGuiBaseUrl(),
): Promise<AgentEvalHealthResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/agent-defs?cwd=${encodeURIComponent(".")}`;
  try {
    const res = await fetch(url, { method: "GET" });
    return {
      ok: res.ok,
      baseUrl,
      chatReachable: res.ok,
      statusCode: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      baseUrl,
      chatReachable: false,
      error: message,
    };
  }
}
