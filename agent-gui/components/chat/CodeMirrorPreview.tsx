"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  buildPreviewCodeMirrorExtensions,
  workspaceCodeMirrorUiTheme,
} from "@/lib/codemirror-setup";

type CodeMirrorPreviewProps = {
  path: string;
  content: string;
  language?: string;
  className?: string;
  /** When set, constrains editor height (compact chat snapshots). */
  maxHeight?: string;
  minHeight?: string;
};

export function CodeMirrorPreview({
  path,
  content,
  language,
  className,
  maxHeight,
  minHeight,
}: CodeMirrorPreviewProps) {
  const extensions = useMemo(
    () => buildPreviewCodeMirrorExtensions(path, { language }),
    [path, language],
  );

  return (
    <div
      className={`file-editor-cm${className ? ` ${className}` : ""}`}
      style={{
        maxHeight,
        minHeight,
      }}
    >
      <CodeMirror
        value={content}
        extensions={extensions}
        theme={workspaceCodeMirrorUiTheme}
        editable={false}
        readOnly
        basicSetup={false}
        height="auto"
        maxHeight={maxHeight}
        minHeight={minHeight}
      />
    </div>
  );
}
