import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveQuickerAgentAppDataDirectory } from "@/lib/quicker-agent-paths";
import { DEFAULT_SKILLS_REL } from "@/lib/agent-skills/paths";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

export const QUICKER_AGENT_DEFS_DIR = ".quicker";
export const WORKSPACE_AGENTS_MD = "AGENTS.md";
export const MAX_WORKSPACE_INSTRUCTIONS_CHARS = 32_000;

/** User-level agent definitions root (QuickerAgent app data). */
export function resolveUserAgentDefsRoot(): string {
  return join(resolveQuickerAgentAppDataDirectory(), "agent-defs");
}

/** Workspace-level .quicker directory under cwd. */
export function resolveWorkspaceAgentDefsRoot(cwd: string): string {
  return join(cwd.trim(), QUICKER_AGENT_DEFS_DIR);
}

/** Bundled skills root (docs/skills in repo or agent-gui copy). */
export function resolveBundledSkillsRoot(): string {
  const repo = resolveQuickerRpcRepoRoot();
  if (repo) {
    return join(repo, DEFAULT_SKILLS_REL);
  }
  return join(resolveAgentGuiRoot(), DEFAULT_SKILLS_REL);
}

export function resolveCommandsDir(root: string): string {
  return join(root, "commands");
}

export function resolveAgentsDir(root: string): string {
  return join(root, "agents");
}

export function resolveSkillsDir(root: string): string {
  return join(root, "skills");
}

export function resolveWorkspaceInstructionsPaths(cwd: string): string[] {
  const trimmed = cwd.trim();
  if (!trimmed) return [];
  return [
    join(trimmed, WORKSPACE_AGENTS_MD),
    join(trimmed, QUICKER_AGENT_DEFS_DIR, WORKSPACE_AGENTS_MD),
  ];
}

export function agentDefsRootExists(root: string): boolean {
  return (
    existsSync(resolveCommandsDir(root))
    || existsSync(resolveAgentsDir(root))
    || existsSync(resolveSkillsDir(root))
  );
}
