/** Relative path `.quicker/actions/{directoryName}`. */
export function actionProjectDirFromName(directoryName: string): string {
  const name = directoryName.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return `.quicker/actions/${name.split("/").pop() ?? name}`;
}

export function getActionsRootRelative(): string {
  return ".quicker/actions";
}

export function joinActionProjectPath(directoryName: string): string {
  const name = directoryName.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return `${getActionsRootRelative()}/${name}`;
}

/** @deprecated Use findActionProjectDirectory — directory name is not the action id. */
export function defaultActionProjectDir(_actionId: string): string {
  void _actionId;
  return ".quicker/actions";
}
