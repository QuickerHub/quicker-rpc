import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";

import { loadSkillInstructions } from "@/lib/agent-skills/load";
import { formatLocalToolResult } from "@/lib/tool-result";

export const SKILL_LOAD_TOOL = "skill_load";
export const SKILL_LOAD_MAX_PAGE_CHARS = 7_000;
const SKILL_FILE_CATALOG_LIMIT = 100;
const CATALOG_DIRS = ["references", "examples", "scripts"] as const;

function safeSkillRelativePath(skillDir: string, requested: string): string | null {
  const normalized = requested.trim().replaceAll("\\", "/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/")) {
    return null;
  }
  const target = resolve(skillDir, normalized);
  const rel = relative(resolve(skillDir), target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === rel) {
    return null;
  }
  return target;
}

async function listFilesRecursively(
  root: string,
  base: string,
  output: string[],
): Promise<void> {
  if (output.length >= SKILL_FILE_CATALOG_LIMIT) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (output.length >= SKILL_FILE_CATALOG_LIMIT) return;
    const absolute = resolve(root, entry.name);
    const logical = relative(base, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      await listFilesRecursively(absolute, base, output);
    } else if (entry.isFile()) {
      output.push(logical);
    }
  }
}

async function listSkillFiles(skillDir: string): Promise<string[]> {
  const files: string[] = [];
  for (const dir of CATALOG_DIRS) {
    await listFilesRecursively(resolve(skillDir, dir), skillDir, files);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export type SkillPage = {
  content: string;
  offset: number;
  nextOffset: number | null;
  totalChars: number;
  truncated: boolean;
};

export function pageSkillContent(
  content: string,
  offset: number,
  limit: number,
): SkillPage {
  const start = Math.min(Math.max(0, offset), content.length);
  const end = Math.min(content.length, start + limit);
  return {
    content: content.slice(start, end),
    offset: start,
    nextOffset: end < content.length ? end : null,
    totalChars: content.length,
    truncated: end < content.length,
  };
}

export const SKILL_LOAD_TOOL_DEF = tool({
  description:
    "Load one discovered Agent Skill by exact name. Returns paged SKILL.md instructions and a catalog of reference/example/script files; pass reference to read one exact skill-relative file.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Exact skill name from the system skill catalog"),
    reference: z
      .string()
      .optional()
      .describe("Exact relative file returned by files, for example references/schema.md"),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(256).max(SKILL_LOAD_MAX_PAGE_CHARS).default(SKILL_LOAD_MAX_PAGE_CHARS),
  }),
  execute: async ({ name, reference, offset, limit }) => {
    const loaded = await loadSkillInstructions(name);
    if (!loaded) {
      return formatLocalToolResult(
        { errorCode: "skill_not_found", name },
        false,
        `Skill "${name}" was not found. Use the exact name from the system skill catalog.`,
        { retryable: false },
      );
    }

    let content = loaded.body;
    let source = "SKILL.md";
    if (reference) {
      const target = safeSkillRelativePath(loaded.skillDir, reference);
      if (!target) {
        return formatLocalToolResult(
          { errorCode: "invalid_skill_reference", name, reference },
          false,
          "reference must be an exact relative path inside the selected skill directory.",
          { retryable: false },
        );
      }
      try {
        const fileStat = await stat(target);
        if (!fileStat.isFile()) throw new Error("not a file");
        content = await readFile(target, "utf8");
        source = relative(loaded.skillDir, target).replaceAll("\\", "/");
      } catch {
        return formatLocalToolResult(
          { errorCode: "skill_reference_not_found", name, reference },
          false,
          `Skill reference "${reference}" was not found or is not a readable text file.`,
          { retryable: false },
        );
      }
    }

    const page = pageSkillContent(content, offset, limit);
    return formatLocalToolResult({
      skill: {
        name: loaded.name,
        description: loaded.description,
        scope: loaded.scope,
        allowedTools: loaded.allowedTools,
      },
      source,
      ...page,
      files: reference ? undefined : await listSkillFiles(loaded.skillDir),
      hint: page.nextOffset === null
        ? undefined
        : `Call skill_load again with offset=${page.nextOffset} and the same name/reference.`,
    });
  },
});

