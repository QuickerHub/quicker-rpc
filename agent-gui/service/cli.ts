import { normalizeAgentDataDirectory } from "../lib/agent-data-profile.mjs";

export type AgentServiceCliOptions = { host: string; port: number; help: boolean; dataDir?: string };

export function parseAgentServiceOptions(args: string[]): AgentServiceCliOptions {
  const options: AgentServiceCliOptions = { host: "127.0.0.1", port: 0, help: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--help" || flag === "-h") { options.help = true; continue; }
    if (flag !== "--host" && flag !== "--port" && flag !== "--data-dir") throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === "--host") {
      if (value !== "127.0.0.1" && value !== "::1") throw new Error("Agent service only listens on loopback");
      options.host = value;
    } else if (flag === "--data-dir") {
      options.dataDir = normalizeAgentDataDirectory(value);
    } else {
      if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error("port must be an integer from 0 to 65535");
      options.port = Number(value);
    }
  }
  return options;
}
