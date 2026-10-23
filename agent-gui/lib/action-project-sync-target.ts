import { fingerprintActionProjectBinding, sameActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";

export type ActionProjectSyncTarget = { projectDirectory: string; projectBinding: ActionProjectBinding };
export const normalizeProjectDirectory = (path: string) => path.replace(/\\/g, "/").replace(/\/$/, "");

export function actionProjectSyncTargetKey(target?: ActionProjectSyncTarget): string {
  return target ? JSON.stringify([normalizeProjectDirectory(target.projectDirectory), fingerprintActionProjectBinding(target.projectBinding)]) : "legacy";
}

export function sameActionProjectSyncTarget(a: ActionProjectSyncTarget, b: ActionProjectSyncTarget): boolean {
  return normalizeProjectDirectory(a.projectDirectory) === normalizeProjectDirectory(b.projectDirectory)
    && sameActionProjectBinding(a.projectBinding, b.projectBinding);
}
