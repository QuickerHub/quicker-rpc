export const AGENT_ARTIFACT_FORMAT_SHELL = "shell-output-v1";
export const AGENT_HISTORY_FORMAT = "agent-history-v1";

/** Client-safe threshold for UI copy / tool-test scenarios. */
export const SHELL_ARTIFACT_THRESHOLD_CHARS = 8_192;
export const SHELL_ARTIFACT_TAIL_CHARS = 2_048;

export type AgentArtifactRef = {
  path: string;
  format: string;
  bytesWritten?: number;
};

export type ShellArtifactPayload = {
  artifactRef: AgentArtifactRef;
  tailPreview: string;
  totalOutputChars: number;
  readHint: string;
};
