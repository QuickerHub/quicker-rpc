import { actionProjectDirFromName } from "@/lib/action-project-path-shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parsed logical workspace path for an action-embedded subprogram. */
export type ParsedActionSubProgramPath = {
  actionId: string;
  subProgramId: string;
  /** Project-relative path under subprograms/{subProgramId}/ (e.g. data.json, files/main.cs). */
  resourcePath: string;
};

/**
 * Parse `action/{actionId}/subprograms/{subProgramId}/...` or
 * `.quicker/actions/{actionId}/subprograms/{subProgramId}/...`.
 */
export function parseActionSubProgramWorkspacePath(
  inputPath: string,
):
  | { ok: true; parsed: ParsedActionSubProgramPath }
  | { ok: false; error: string } {
  const normalized = inputPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    return { ok: false, error: "path is required." };
  }

  let rest = normalized;
  if (rest.toLowerCase().startsWith(".quicker/actions/")) {
    rest = rest.slice(".quicker/actions/".length);
  } else if (rest.toLowerCase().startsWith("action/")) {
    rest = rest.slice("action/".length);
  } else {
    return { ok: false, error: "path must start with action/ or .quicker/actions/." };
  }

  const segments = rest.split("/").filter(Boolean);
  if (segments.length < 3) {
    return {
      ok: false,
      error: "path must include action/{id}/subprograms/{subProgramId}/....",
    };
  }

  const actionId = segments[0]!;
  if (!UUID_RE.test(actionId)) {
    return { ok: false, error: "action id must be a GUID." };
  }

  if (segments[1]!.toLowerCase() !== "subprograms") {
    return { ok: false, error: "expected subprograms segment after action id." };
  }

  const subProgramId = segments[2]!;
  if (!subProgramId || subProgramId === "." || subProgramId === "..") {
    return { ok: false, error: "subProgramId is required." };
  }

  const resourcePath = segments.slice(3).join("/");
  if (resourcePath.split("/").some((s) => s === ".." || s === ".")) {
    return { ok: false, error: "path must not contain . or .. segments." };
  }

  return {
    ok: true,
    parsed: { actionId, subProgramId, resourcePath },
  };
}

/** Disk-relative path: `.quicker/actions/{actionId}/subprograms/{subProgramId}/...` */
export function actionSubProgramProjectDir(
  actionId: string,
  subProgramId: string,
): string {
  const actionDir = actionProjectDirFromName(actionId.trim());
  const subId = subProgramId.trim().replace(/\\/g, "/").split("/").pop() ?? subProgramId.trim();
  return `${actionDir}/subprograms/${subId}`;
}

/** Full workspace-relative path for a subprogram resource. */
export function actionSubProgramWorkspacePath(
  actionId: string,
  subProgramId: string,
  resourcePath: string,
): string {
  const base = actionSubProgramProjectDir(actionId, subProgramId);
  const rel = resourcePath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return rel ? `${base}/${rel}` : base;
}

/** Logical path label for UI: `action/{id}/subprograms/{subId}/...` */
export function formatActionSubProgramPathLabel(
  actionId: string,
  subProgramId: string,
  resourcePath?: string,
): string {
  const base = `action/${actionId.trim()}/subprograms/${subProgramId.trim()}`;
  const rel = resourcePath?.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return rel ? `${base}/${rel}` : base;
}
