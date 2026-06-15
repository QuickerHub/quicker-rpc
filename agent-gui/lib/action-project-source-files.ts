export type ActionProjectSourceFileTab = {
  /** Workspace-relative path. */
  path: string;
  /** Short label shown on the sub-tab. */
  label: string;
};

export type ProjectListEntry = {
  path: string;
  kind: "file" | "directory";
};

/** Build read-only source sub-tabs for a program project (data.json editor). */
export function buildActionProjectSourceFileTabs(
  projectDir: string,
  dataJsonPath: string,
  entries: ProjectListEntry[],
): ActionProjectSourceFileTab[] {
  const normalizedProject = projectDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedData = dataJsonPath.replace(/\\/g, "/");
  const tabs: ActionProjectSourceFileTab[] = [
    { path: normalizedData, label: "data.json" },
  ];

  const filePaths = entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path.replace(/\\/g, "/"))
    .filter((rel) => {
      if (rel === "data.json") return false;
      if (rel === "info.json") return true;
      return rel.startsWith("files/");
    })
    .sort((a, b) => {
      if (a === "info.json") return -1;
      if (b === "info.json") return 1;
      return a.localeCompare(b);
    });

  for (const rel of filePaths) {
    tabs.push({
      path: `${normalizedProject}/${rel}`,
      label: rel,
    });
  }

  return tabs;
}
