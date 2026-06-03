"use client";

import { useEffect, useMemo, useRef } from "react";
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

export function ToolJsonEditor({
  value,
  followTail = false,
  className,
}: ToolJsonEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = useMemo(() => formatJsonDisplayText(value), [value]);
  const extensions = useMemo(
    () => buildPreviewCodeMirrorExtensions("tool-result.json", { language: "json" }),
    [],
  );

  useEffect(() => {
    if (!followTail) return;
    const scroller = scrollRef.current?.querySelector(".cm-scroller");
    if (!(scroller instanceof HTMLElement)) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [text, followTail]);

  return (
    <div
      ref={scrollRef}
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
