import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  formatValuePrefixWarningsMessage,
  scanProgramValuePrefixWarnings,
  type ProgramValuePrefixWarning,
} from "@/lib/quicker-interpolation-lint";

export async function scanProjectDirectoryValuePrefixWarnings(
  projectDirAbs: string,
): Promise<ProgramValuePrefixWarning[]> {
  const warnings: ProgramValuePrefixWarning[] = [];

  const mainPath = join(projectDirAbs, "data.json");
  if (existsSync(mainPath)) {
    const raw = await readFile(mainPath, "utf8");
    warnings.push(...scanProgramValuePrefixWarnings(raw));
  }

  const subRoot = join(projectDirAbs, "subprograms");
  if (!existsSync(subRoot)) {
    return warnings;
  }

  let entries: string[] = [];
  try {
    entries = await readdir(subRoot, { withFileTypes: true }).then((items) =>
      items.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    return warnings;
  }

  for (const dirName of entries) {
    const subData = join(subRoot, dirName, "data.json");
    if (!existsSync(subData)) {
      continue;
    }
    const raw = await readFile(subData, "utf8");
    for (const hit of scanProgramValuePrefixWarnings(raw)) {
      warnings.push({
        ...hit,
        location: `subprograms/${dirName}/${hit.location}`,
      });
    }
  }

  return warnings;
}

export async function guardProjectValuePrefixes(
  projectDirAbs: string,
  options?: { force?: boolean },
): Promise<
  | { ok: true }
  | { ok: false; warnings: ProgramValuePrefixWarning[]; message: string }
> {
  if (options?.force) {
    return { ok: true };
  }

  const warnings = await scanProjectDirectoryValuePrefixWarnings(projectDirAbs);
  if (warnings.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    warnings,
    message: formatValuePrefixWarningsMessage(warnings),
  };
}
