export const AGENT_DATA_DIRECTORY_ENV: "QUICKER_AGENT_DATA_DIR";
export const AGENT_DATA_DIRECTORY_NAME: "QuickerAgent";
export type AgentDataProfile = Readonly<{ directory: string; explicit: boolean }>;
export function normalizeAgentDataDirectory(value: string): string;
export function resolveDefaultAgentDataDirectory(options?: {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  home?: string;
}): string;
export function resolveAgentDataProfile(): AgentDataProfile;
export function configureAgentDataProfile(dataDir?: string): AgentDataProfile;
