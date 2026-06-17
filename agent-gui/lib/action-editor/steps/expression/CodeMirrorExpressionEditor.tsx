"use client";

import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { EditorView } from "@codemirror/view";
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
/** Matches expressionEditorCodeMirrorTheme `.cm-scroller` line-height. */
const MULTILINE_LINE_HEIGHT = 18;

function clampMultilineHeight(contentHeight: number, maxHeight: number): number {
  return Math.min(Math.max(contentHeight, MIN_MULTILINE_HEIGHT), maxHeight);
}

function estimateMultilineHeight(text: string, maxHeight: number): number {
  const lines = Math.max(1, text.split(/\r?\n/).length);
  return clampMultilineHeight(lines * MULTILINE_LINE_HEIGHT, maxHeight);
}

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

  const [multilineHeight, setMultilineHeight] = useState(() =>
    multiline ? estimateMultilineHeight(value, cappedMultilineHeight) : MIN_MULTILINE_HEIGHT,
  );

  useEffect(() => {
    if (!multiline) {
      return;
    }
    setMultilineHeight(estimateMultilineHeight(value, cappedMultilineHeight));
  }, [multiline, cappedMultilineHeight]);

  const handleLayout = useCallback(
    (view: EditorView) => {
      const next = clampMultilineHeight(view.contentHeight, cappedMultilineHeight);
      setMultilineHeight((prev) => (prev === next ? prev : next));
    },
    [cappedMultilineHeight],
  );

  const extensions = useMemo(
    () =>
      buildExpressionEditorExtensions({
        multiline,
        readOnly: disabled,
        onLayout: multiline ? handleLayout : undefined,
      }),
    [multiline, disabled, handleLayout],
  );

  const rootClass = [
    "expression-editor",
    multiline ? "expression-editor--multiline" : "expression-editor--inline",
    "expression-editor--cm",
    multiline ? "expression-editor--auto-height" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const showPlaceholder = (placeholder ?? "").length > 0 && value.length === 0;

  const heightPx = multiline ? multilineHeight : INLINE_HEIGHT;
  const heightStyle = `${heightPx}px`;
  const maxHeightStyle = multiline ? `${cappedMultilineHeight}px` : undefined;

  return (
    <div
      className={rootClass}
      style={{
        height: heightStyle,
        maxHeight: maxHeightStyle,
        overflow: "hidden",
      }}
    >
      {showPlaceholder ? <div className="expression-editor-placeholder">{placeholder}</div> : null}
      <CodeMirror
        value={value}
        theme="none"
        height={heightStyle}
        maxHeight={maxHeightStyle}
        minHeight={multiline ? `${MIN_MULTILINE_HEIGHT}px` : undefined}
        extensions={extensions}
        onChange={onChange}
        basicSetup={false}
        editable={!disabled}
      />
    </div>
  );
}
