import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillTopicsManifest } from "@/lib/agent-skills/types";

const TOPICS_MANIFEST = "topics.json";

export async function loadTopicsManifest(
  skillDir: string,
): Promise<SkillTopicsManifest | null> {
  try {
    const raw = await readFile(join(skillDir, TOPICS_MANIFEST), "utf8");
    return JSON.parse(raw) as SkillTopicsManifest;
  } catch {
    return null;
  }
}
