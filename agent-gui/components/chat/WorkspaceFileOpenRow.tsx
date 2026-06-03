"use client";



import { useMemo } from "react";

import {

  basenamePath,

  isWorkspaceExplorerFileTool,

  isWorkspaceFileEditorTool,

  workspaceFileOpenRowSubtitle,

} from "@/lib/workspace-file-tool";

import { useWorkspaceExplorerActions } from "@/lib/workspace-explorer";

import { isQkrpcToolResult, type QkrpcToolResult } from "./tool-output";



type WorkspaceFileOpenRowProps = {

  toolName: string;

  displayName: string;

  meta: string;

  isRunning: boolean;

  state: string;

  input?: unknown;

  output?: QkrpcToolResult;

  inBatch?: boolean;

  errorText?: string;

};



export function WorkspaceFileOpenRow({

  toolName,

  displayName,

  meta,

  isRunning,

  state,

  input,

  output,

  inBatch = false,

  errorText,

}: WorkspaceFileOpenRowProps) {

  const { openFileFromTool, revealPath, setPanelOpen } = useWorkspaceExplorerActions();



  const path =

    typeof input === "object" && input !== null && "path" in input

      ? String((input as { path: unknown }).path ?? "")

      : "";

  const fileLabel = path ? basenamePath(path) : displayName;

  const subtitle = workspaceFileOpenRowSubtitle(

    toolName,

    meta,

    isRunning,

    input,

  );



  const handleOpen = () => {

    if (output?.ok) {

      openFileFromTool(toolName, input, output);

    } else if (path) {

      revealPath(path);

    }

    setPanelOpen(true);

  };



  return (

    <div

      className={`tool-card tool-card--file-open tool-card--preview${inBatch ? " tool-card--nested" : ""}${isRunning ? " tool-card--running" : ""}`}

    >

      <button

        type="button"

        className="tool-file-open-btn"

        onClick={handleOpen}

        aria-label={`打开 ${fileLabel}`}

      >

        <span className="tool-title">

          <span className="tool-name">{displayName}</span>

          <span

            className={`tool-meta${isRunning ? " tool-meta--running" : ""}${state === "output-error" ? " tool-meta--err" : ""}`}

          >

            {subtitle}

          </span>

        </span>

      </button>

      {errorText ? <pre className="tool-error">{errorText}</pre> : null}

    </div>

  );

}



/** Collapsed batch row for non-editor file tools only (editor tools show inline snapshots). */
export function isWorkspaceFileOpenBatch(

  items: Array<{ name: string }>,

): boolean {

  return (
    items.length > 0
    && items.every(
      (item) =>
        isWorkspaceExplorerFileTool(item.name)
        && !isWorkspaceFileEditorTool(item.name),
    )
  );

}



export function WorkspaceFileBatchRow({

  items,

  inBatch = false,

}: {

  items: Array<{

    name: string;

    displayName: string;

    meta: string;

    isRunning: boolean;

    state: string;

    part: { input?: unknown; output?: unknown };

  }>;

  inBatch?: boolean;

}) {

  const { setPanelOpen, refreshTree } = useWorkspaceExplorerActions();

  const running = items.some((i) => i.isRunning);

  const errors = items.filter((i) => i.state === "output-error").length;

  const names = [...new Set(items.map((i) => i.displayName))];

  const title = names.length === 1 ? names[0]! : "files";



  const meta = useMemo(() => {

    if (running) {

      return `${items.filter((i) => i.isRunning).length}/${items.length} 执行中…`;

    }

    if (errors > 0) {

      return `${errors} 个失败`;

    }

    return `${items.length} 个文件`;

  }, [errors, items, running]);



  return (

    <div

      className={`tool-card tool-card--file-open tool-card--preview${inBatch ? " tool-card--nested" : ""}`}

    >

      <button

        type="button"

        className="tool-file-open-btn"

        onClick={() => {

          setPanelOpen(true);

          void refreshTree();

        }}

      >

        <span className="tool-title">

          <span className="tool-name">{title}</span>

          <span className={`tool-meta${running ? " tool-meta--running" : ""}`}>

            {meta}

          </span>

        </span>

      </button>

    </div>

  );

}


