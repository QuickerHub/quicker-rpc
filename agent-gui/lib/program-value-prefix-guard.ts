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

/** Agent-facing fields attached to successful write/edit/patch when lint finds possible prefix issues. */
export function buildValuePrefixWarningFields(
  warnings: ProgramValuePrefixWarning[],
): Record<string, unknown> {
  if (warnings.length === 0) {
    return {};
  }
  return {
    valuePrefixWarningCount: warnings.length,
    valuePrefixWarnings: warnings.slice(0, 12),
    firstFixRead: warnings.find((w) => w.read)?.read,
    valuePrefixWarningMessage: formatValuePrefixWarningsMessage(warnings),
  };
}

export function augmentToolResultWithPrefixWarnings(
  result: Record<string, unknown>,
  warnings: ProgramValuePrefixWarning[],
): Record<string, unknown> {
  if (warnings.length === 0) {
    return result;
  }
  const ok = result.ok === true;
  const data = result.data;
  if (!ok || typeof data !== "object" || data === null) {
    return result;
  }
  return {
    ...result,
    data: {
      ...(data as Record<string, unknown>),
      ...buildValuePrefixWarningFields(warnings),
    },
  };
}

/** Non-blocking scan before patch; literal `{var}` text is allowed — warnings only. */
export async function guardProjectValuePrefixes(
  projectDirAbs: string,
  options?: { force?: boolean },
): Promise<{
  warnings: ProgramValuePrefixWarning[];
  message: string;
}> {
  if (options?.force) {
    return { warnings: [], message: "" };
  }

  const warnings = await scanProjectDirectoryValuePrefixWarnings(projectDirAbs);
  return {
    warnings,
    message:
      warnings.length > 0
        ? formatValuePrefixWarningsMessage(warnings)
        : "",
  };
}
