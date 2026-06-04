import { actionSubProgramProjectDir } from "@/lib/action-subprogram-path";
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import type { WorkspaceProgramTargetKind } from "@/lib/workspace-program-schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkspaceProgramTarget =
  | { kind: "action"; actionId: string }
  | { kind: "global_subprogram"; subProgramKey: string }
  | {
      kind: "embedded_subprogram";
      actionId: string;
      subProgramId: string;
    };

export type ParsedWorkspaceProgramInput = {
  target: WorkspaceProgramTargetKind;
  id: string;
  subProgramId?: string;
};

export function isActionGuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseWorkspaceProgramTarget(
  input: ParsedWorkspaceProgramInput,
):
  | { ok: true; target: WorkspaceProgramTarget }
  | { ok: false; error: string } {
  const kind = input.target;
  const id = input.id.trim();
  if (!id) {
    return { ok: false, error: "id is required." };
  }

  if (kind === "action") {
    if (!isActionGuid(id)) {
      return { ok: false, error: "target=action requires id to be a Quicker action GUID." };
    }
    return { ok: true, target: { kind: "action", actionId: id } };
  }

  if (kind === "global_subprogram") {
    return { ok: true, target: { kind: "global_subprogram", subProgramKey: id } };
  }

  const subProgramId = input.subProgramId?.trim();
  if (!subProgramId) {
    return {
      ok: false,
      error: "subProgramId is required when target=embedded_subprogram.",
    };
  }
  if (!isActionGuid(id)) {
    return {
      ok: false,
      error: "target=embedded_subprogram requires id to be the parent action GUID.",
    };
  }
  return {
    ok: true,
    target: {
      kind: "embedded_subprogram",
      actionId: id,
      subProgramId,
    },
  };
}

export function globalSubProgramProjectDir(key: string): string {
  const sanitized = key.trim().replace(/\\/g, "/").split("/").pop() ?? key.trim();
  return `.quicker/subprograms/${sanitized}`;
}

export function getGlobalSubProgramsRootRelative(): string {
  return ".quicker/subprograms";
}

/** Workspace-relative project root for the program target. */
export function workspaceProgramProjectDir(target: WorkspaceProgramTarget): string {
  switch (target.kind) {
    case "action":
      return actionProjectDirFromName(target.actionId);
    case "global_subprogram":
      return globalSubProgramProjectDir(target.subProgramKey);
    case "embedded_subprogram":
      return actionSubProgramProjectDir(target.actionId, target.subProgramId);
  }
}

export function workspaceProgramDataJsonPath(target: WorkspaceProgramTarget): string {
  return `${workspaceProgramProjectDir(target)}/data.json`;
}

export function workspaceProgramInfoJsonPath(target: WorkspaceProgramTarget): string {
  return `${workspaceProgramProjectDir(target)}/info.json`;
}

export function formatWorkspaceProgramLabel(target: WorkspaceProgramTarget): string {
  switch (target.kind) {
    case "action":
      return `action/${target.actionId}`;
    case "global_subprogram":
      return `subprogram/${target.subProgramKey}`;
    case "embedded_subprogram":
      return `action/${target.actionId}/subprograms/${target.subProgramId}`;
  }
}

/** Primary id returned in tool payloads (action GUID or subprogram key). */
export function workspaceProgramPrimaryId(target: WorkspaceProgramTarget): string {
  switch (target.kind) {
    case "action":
      return target.actionId;
    case "global_subprogram":
      return target.subProgramKey;
    case "embedded_subprogram":
      return target.subProgramId;
  }
}

/** Parent action id when saving embedded subprograms (otherwise undefined). */
export function workspaceProgramSaveActionId(
  target: WorkspaceProgramTarget,
): string | undefined {
  switch (target.kind) {
    case "action":
      return target.actionId;
    case "global_subprogram":
      return undefined;
    case "embedded_subprogram":
      return target.actionId;
  }
}
