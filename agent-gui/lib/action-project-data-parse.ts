import { basenamePath } from "@/lib/workspace-file-tool";

export function isActionProjectDataPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (basenamePath(normalized).toLowerCase() !== "data.json") {
    return false;
  }
  return /\.quicker\/actions\/[^/]+\/data\.json$/i.test(normalized);
}

export function actionIdFromDataPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/\.quicker\/actions\/([^/]+)\/data\.json$/i);
  return match?.[1];
}

/** Sibling info.json for a project data.json path. */
export function actionProjectInfoPathFromDataPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  if (basenamePath(normalized).toLowerCase() !== "data.json") return undefined;
  return normalized.replace(/\/data\.json$/i, "/info.json");
}
