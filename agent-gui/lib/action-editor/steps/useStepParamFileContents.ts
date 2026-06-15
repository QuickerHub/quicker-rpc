import { useEffect, useMemo, useState } from "react";
import type { ActionStep } from "@/lib/action-editor/types/common";
import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import type { ActionProjectWorkspaceContext } from "./paramEditors/FormDefEditorDialog";
import { projectRelativeFilePath } from "./paramEditors/formSpecModel";
import {
  collectStepParamFilePaths,
  type StepSummaryFileContents,
} from "./stepSummaryFileRefs";

/** Load project-relative files/ paths referenced by step input params. */
export async function fetchStepParamFileContents(
  workspaceContext: ActionProjectWorkspaceContext,
  paths: readonly string[],
): Promise<StepSummaryFileContents> {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    unique.map(async (file) => {
      const absolute = projectRelativeFilePath(workspaceContext.projectDir, file);
      const result = await fetchWorkspaceFile(workspaceContext.cwd, absolute);
      return [file, result.ok ? result.content : ""] as const;
    }),
  );

  const out: Record<string, string> = {};
  for (const [file, content] of entries) {
    if (content.trim().length > 0) {
      out[file] = content;
    }
  }
  return out;
}

/** Prefetch files/… content for step param summaries and variable-usage scans. */
export function useStepParamFileContents(
  steps: readonly ActionStep[],
  workspaceContext?: ActionProjectWorkspaceContext,
): StepSummaryFileContents {
  const stepFilePathsKey = useMemo(
    () => collectStepParamFilePaths(steps).sort().join("\0"),
    [steps],
  );

  const [fileContentsByPath, setFileContentsByPath] = useState<StepSummaryFileContents>({});

  useEffect(() => {
    if (!workspaceContext || stepFilePathsKey.length === 0) {
      setFileContentsByPath((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      return;
    }

    const paths = stepFilePathsKey.split("\0").filter(Boolean);
    let cancelled = false;
    void (async () => {
      const next = await fetchStepParamFileContents(workspaceContext, paths);
      if (!cancelled) {
        setFileContentsByPath(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stepFilePathsKey, workspaceContext]);

  return fileContentsByPath;
}
