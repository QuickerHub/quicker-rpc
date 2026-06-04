import { basenamePath } from "@/lib/workspace-file-tool";

const ACTION_DATA_JSON_RE =
  /\.quicker\/actions\/[^/]+\/data\.json$/i;
const GLOBAL_SUBPROGRAM_DATA_JSON_RE =
  /\.quicker\/subprograms\/[^/]+\/data\.json$/i;
const EMBEDDED_SUBPROGRAM_DATA_JSON_RE =
  /\.quicker\/actions\/[^/]+\/subprograms\/[^/]+\/data\.json$/i;

export function isGlobalSubProgramDataPath(path: string): boolean {
  return GLOBAL_SUBPROGRAM_DATA_JSON_RE.test(path.replace(/\\/g, "/"));
}

export function isEmbeddedSubProgramDataPath(path: string): boolean {
  return EMBEDDED_SUBPROGRAM_DATA_JSON_RE.test(path.replace(/\\/g, "/"));
}

export function isActionProjectDataPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (basenamePath(normalized).toLowerCase() !== "data.json") {
    return false;
  }
  return (
    ACTION_DATA_JSON_RE.test(normalized)
    || GLOBAL_SUBPROGRAM_DATA_JSON_RE.test(normalized)
    || EMBEDDED_SUBPROGRAM_DATA_JSON_RE.test(normalized)
  );
}

/** Parent action GUID from action or embedded subprogram data.json path. */
export function actionIdFromDataPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const embedded = normalized.match(
    /\.quicker\/actions\/([^/]+)\/subprograms\/[^/]+\/data\.json$/i,
  );
  if (embedded) return embedded[1];
  const match = normalized.match(/\.quicker\/actions\/([^/]+)\/data\.json$/i);
  return match?.[1];
}

/** Workspace-relative project directory for embedded subprogram data.json. */
export function embeddedSubProgramProjectDirFromDataPath(
  path: string,
): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  if (!isEmbeddedSubProgramDataPath(normalized)) return undefined;
  return normalized.replace(/\/data\.json$/i, "");
}

/** Workspace-relative project directory for global subprogram data.json. */
export function globalSubProgramProjectDirFromDataPath(
  path: string,
): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  if (!isGlobalSubProgramDataPath(normalized)) return undefined;
  return normalized.replace(/\/data\.json$/i, "");
}

/** Workspace-relative project root for a program data.json path. */
export function programProjectDirFromDataPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  if (!isActionProjectDataPath(normalized)) return undefined;
  return normalized.replace(/\/data\.json$/i, "");
}

/** Sibling info.json for a project data.json path (action, global, or embedded subprogram). */
export function actionProjectInfoPathFromDataPath(path: string): string | undefined {
  const projectDir = programProjectDirFromDataPath(path);
  if (!projectDir) return undefined;
  return `${projectDir}/info.json`;
}
