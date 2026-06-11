"use client";

import { memo, useMemo } from "react";
import { formatJsonDisplayText } from "@/lib/format-json-display";
import {
  buildPreviewCodeMirrorExtensions,
  workspaceCodeMirrorUiTheme,
} from "@/lib/codemirror-setup";
import CodeMirror from "@uiw/react-codemirror";

type ToolJsonEditorProps = {
  value: unknown;
  followTail?: boolean;
  className?: string;
};

function ToolJsonEditorInner({
  value,
  className,
}: ToolJsonEditorProps) {
  const text = useMemo(() => formatJsonDisplayText(value), [value]);
  const extensions = useMemo(
    () => buildPreviewCodeMirrorExtensions("tool-result.json", { language: "json" }),
    [],
  );

  return (
    <div
      className={`tool-json-editor file-editor-cm${className ? ` ${className}` : ""}`}
    >
      <CodeMirror
        value={text}
        extensions={extensions}
        theme={workspaceCodeMirrorUiTheme}
        editable={false}
        readOnly
        basicSetup={false}
        height="auto"
      />
    </div>
  );
}

export const ToolJsonEditor = memo(ToolJsonEditorInner);
