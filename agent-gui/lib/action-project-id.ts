import type { ParsedActionProjectInfo } from "@/lib/action-project-info-parse";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quicker action GUID from info.json id and/or `.quicker/actions/{dir}` folder name. */
export function resolveActionIdFromProject(
  projectDirName: string | undefined,
  parsed?: Pick<ParsedActionProjectInfo, "id">,
): string | undefined {
  const fromInfo = parsed?.id?.trim();
  if (fromInfo && UUID_RE.test(fromInfo)) return fromInfo;

  const dir = projectDirName?.trim();
  if (dir && UUID_RE.test(dir)) return dir;

  return undefined;
}
