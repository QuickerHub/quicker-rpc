import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

/** Default bundled skills directory relative to repo root. */
export const DEFAULT_SKILLS_REL = "docs/skills";

/** Skills preloaded into QuickerAgent system prompt (tier 2 at session start). */
export const PRELOADED_SKILL_NAMES = [
  "quicker-authoring",
  "quicker-eval-expression",
] as const;

/**
 * Optional tier-2 body override per skill (QuickerAgent hot-router files).
 * When absent, SKILL.md body is used per agentskills.io.
 */
export const SKILL_TIER2_BODY_FILES: Record<string, string> = {
  "quicker-authoring": "prompt-tier0.md",
  "quicker-eval-expression": "prompt-tier2.md",
};

/** One-line scope hint injected above preloaded tier-2 body. */
export const PRELOADED_SKILL_SCOPES: Record<string, string> = {
  "quicker-authoring":
    "create/edit program bodies (steps, variables, files). Else use main Capabilities.",
  "quicker-eval-expression":
    "P4 expressions ($=, $$, evalexpression, .eval.cs) — preloaded; use before writing expression steps.",
};

/** Resolve the skills root directory (docs/skills in repo, or bundled copy). */
export function resolveSkillsRoot(): string {
  const repo = resolveQuickerRpcRepoRoot();
  if (repo) {
    return join(repo, DEFAULT_SKILLS_REL);
  }
  return join(resolveAgentGuiRoot(), DEFAULT_SKILLS_REL);
}

/** Absolute path to a single skill directory by name (bundled fallback). */
export function resolveSkillDir(skillName: string): string {
  return join(resolveSkillsRoot(), skillName);
}

/** Resolve skill directory from a discovered record or bundled fallback. */
export function resolveSkillDirFromRecord(
  skillName: string,
  skillDir?: string,
): string {
  return skillDir?.trim() || resolveSkillDir(skillName);
}

export function skillMdExists(skillDir: string): boolean {
  return existsSync(join(skillDir, "SKILL.md"));
}
