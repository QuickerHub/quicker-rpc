"use client";

import CodeMirror from "@uiw/react-codemirror";
import { useMemo, type JSX } from "react";
import { buildExpressionEditorExtensions } from "./expressionEditorCodeMirrorSetup";

export type CodeMirrorExpressionEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  maxMultilineHeight?: number;
  className?: string;
};

const MIN_MULTILINE_HEIGHT = 40;
const DEFAULT_MAX_MULTILINE_HEIGHT = 200;
const INLINE_HEIGHT = 22;

export function CodeMirrorExpressionEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  multiline = false,
  maxMultilineHeight = DEFAULT_MAX_MULTILINE_HEIGHT,
  className,
}: CodeMirrorExpressionEditorProps): JSX.Element {
  const cappedMultilineHeight = Math.max(MIN_MULTILINE_HEIGHT, maxMultilineHeight);
  const multilineHeight = `${cappedMultilineHeight}px`;

  const extensions = useMemo(
    () =>
      buildExpressionEditorExtensions({
        multiline,
        readOnly: disabled,
      }),
    [multiline, disabled],
  );

  const rootClass = [
    "expression-editor",
    multiline ? "expression-editor--multiline" : "expression-editor--inline",
    "expression-editor--cm",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const showPlaceholder = (placeholder ?? "").length > 0 && value.length === 0;

  return (
    <div
      className={rootClass}
      style={
        multiline
          ? {
              height: multilineHeight,
              maxHeight: multilineHeight,
              overflow: "hidden",
            }
          : { height: `${INLINE_HEIGHT}px`, overflow: "hidden" }
      }
    >
      {showPlaceholder ? <div className="expression-editor-placeholder">{placeholder}</div> : null}
      <CodeMirror
        value={value}
        theme="none"
        height={multiline ? multilineHeight : `${INLINE_HEIGHT}px`}
        maxHeight={multiline ? multilineHeight : undefined}
        minHeight={multiline ? `${MIN_MULTILINE_HEIGHT}px` : undefined}
        extensions={extensions}
        onChange={onChange}
        basicSetup={false}
        editable={!disabled}
      />
    </div>
  );
}
