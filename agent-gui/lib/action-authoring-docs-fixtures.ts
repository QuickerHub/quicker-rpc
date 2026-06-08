import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthoringDocSearchRow } from "@/lib/action-authoring-docs-search";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

type TopicsManifestEntry = {
  topic: string;
  title?: string;
  description: string;
};

type ReferenceCatalogEntry = {
  id: string;
  title: string;
  path: string;
};

type TopicsManifest = {
  topics: TopicsManifestEntry[];
  referenceCatalog?: Record<string, ReferenceCatalogEntry[]>;
};

function extractTitle(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return "";
}

export function resolveAuthoringSkillsRoot(): string {
  const repo = resolveQuickerRpcRepoRoot();
  if (!repo) {
    throw new Error("Cannot resolve quicker-rpc repo root for authoring docs fixtures");
  }
  return join(repo, "docs/skills/quicker-authoring");
}

async function readTopicMarkdown(
  skillsRoot: string,
  topic: string,
): Promise<string | null> {
  const file =
    topic === "overview"
      ? join(skillsRoot, "references", "overview.md")
      : join(skillsRoot, "references", `${topic}.md`);
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Load authoring docs rows from repo markdown (offline, no server-only). */
export async function loadAuthoringDocFixtureRows(): Promise<AuthoringDocSearchRow[]> {
  const skillsRoot = resolveAuthoringSkillsRoot();
  const manifestRaw = await readFile(join(skillsRoot, "topics.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as TopicsManifest;
  const rows: AuthoringDocSearchRow[] = [];

  for (const meta of manifest.topics) {
    const markdown = await readTopicMarkdown(skillsRoot, meta.topic);
    if (markdown == null) continue;

    rows.push({
      topic: meta.topic,
      title: meta.title?.trim() || extractTitle(markdown) || meta.topic,
      description: meta.description,
      markdown,
    });

    const refs = manifest.referenceCatalog?.[meta.topic] ?? [];
    for (const ref of refs) {
      if (ref.id === "_catalog") continue;
      const refPath = join(skillsRoot, "references", ref.path);
      let refMarkdown: string;
      try {
        refMarkdown = await readFile(refPath, "utf8");
      } catch {
        continue;
      }
      rows.push({
        topic: meta.topic,
        reference: ref.id,
        title: extractTitle(refMarkdown) || ref.title,
        description: meta.description,
        markdown: refMarkdown,
      });
    }
  }

  return rows;
}
