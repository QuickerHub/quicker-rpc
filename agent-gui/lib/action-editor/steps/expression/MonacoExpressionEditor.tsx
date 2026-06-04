import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useTheme } from "../../shared/ThemeContext";
import { configureMonacoWorkers } from "./monacoWorkers";
import { getQuickerMonacoTheme, QUICKER_EXPRESSION_LANGUAGE, registerQuickerMonaco } from "./quickerMonacoSetup";

export type MonacoExpressionEditorProps = {
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
const FONT_FAMILY = "'Cascadia Code', Consolas, 'Courier New', monospace";

function buildEditorOptions(multiline: boolean): MonacoEditor.IStandaloneEditorConstructionOptions {
  return {
    language: QUICKER_EXPRESSION_LANGUAGE,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: "off",
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    // Line highlight is enabled on focus only (see handleMount).
    renderLineHighlight: "none",
    scrollbar: {
      vertical: multiline ? "auto" : "hidden",
      horizontal: "auto",
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
      useShadows: false,
      // Let wheel bubble to popup body when the editor cannot scroll (or is at an edge).
      alwaysConsumeMouseWheel: false
    },
    wordWrap: multiline ? "on" : "off",
    wrappingStrategy: "advanced",
    automaticLayout: false,
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    lineHeight: 18,
    padding: multiline ? { top: 4, bottom: 4 } : { top: 2, bottom: 2 },
    tabSize: 4,
    insertSpaces: true,
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    parameterHints: { enabled: false },
    codeLens: false,
    matchBrackets: "always",
    renderValidationDecorations: "off",
    unicodeHighlight: { ambiguousCharacters: false },
    contextmenu: true,
    links: false,
    colorDecorators: false,
    // Compact param fields: sticky headers look wrong with transparent editor chrome.
    stickyScroll: { enabled: false }
  };
}

export function MonacoExpressionEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  multiline = false,
  maxMultilineHeight = DEFAULT_MAX_MULTILINE_HEIGHT,
  className
}: MonacoExpressionEditorProps): JSX.Element {
  const { theme: appTheme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const userFixedHeightRef = useRef(false);
  const [height, setHeight] = useState(multiline ? MIN_MULTILINE_HEIGHT : INLINE_HEIGHT);

  const monacoTheme = getQuickerMonacoTheme(appTheme);

  const layoutEditor = useCallback(() => {
    editorRef.current?.layout();
  }, []);

  const syncHeightFromContent = useCallback(() => {
    if (!multiline || userFixedHeightRef.current) {
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const contentHeight = editor.getContentHeight();
    const cap = Math.max(MIN_MULTILINE_HEIGHT, maxMultilineHeight);
    const next = Math.min(Math.max(contentHeight, MIN_MULTILINE_HEIGHT), cap);
    setHeight(next);
    requestAnimationFrame(() => editor.layout());
  }, [multiline, maxMultilineHeight]);

  useLayoutEffect(() => {
    configureMonacoWorkers();
  }, []);

  useEffect(() => {
    if (!multiline) {
      setHeight(INLINE_HEIGHT);
      userFixedHeightRef.current = false;
      return;
    }
    setHeight(MIN_MULTILINE_HEIGHT);
    userFixedHeightRef.current = false;
    syncHeightFromContent();
  }, [multiline, syncHeightFromContent]);

  useEffect(() => {
    if (!multiline) {
      return;
    }
    syncHeightFromContent();
  }, [value, multiline, syncHeightFromContent]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.updateOptions(buildEditorOptions(multiline));
    layoutEditor();
    if (multiline) {
      syncHeightFromContent();
    }
  }, [multiline, layoutEditor, syncHeightFromContent]);

  useEffect(() => {
    void loader.init().then((monaco) => {
      monaco.editor.setTheme(monacoTheme);
    });
  }, [monacoTheme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      layoutEditor();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [layoutEditor]);

  const handleBeforeMount = (monaco: Monaco): void => {
    registerQuickerMonaco(monaco);
  };

  const handleMount = (editor: MonacoEditor.IStandaloneCodeEditor): void => {
    editorRef.current = editor;
    syncHeightFromContent();
    editor.onDidContentSizeChange(() => {
      syncHeightFromContent();
    });
    if (multiline) {
      const setLineHighlight = (focused: boolean): void => {
        editor.updateOptions({ renderLineHighlight: focused ? "line" : "none" });
      };
      editor.onDidFocusEditorWidget(() => setLineHighlight(true));
      editor.onDidBlurEditorWidget(() => setLineHighlight(false));
      if (editor.hasTextFocus()) {
        setLineHighlight(true);
      }
    }
    layoutEditor();
  };

  const handleChange = (next: string | undefined): void => {
    onChange(next ?? "");
  };

  const rootClass = [
    "expression-editor",
    multiline ? "expression-editor--multiline" : "expression-editor--inline",
    "expression-editor--monaco",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  const showPlaceholder = (placeholder ?? "").length > 0 && value.length === 0;

  return (
    <div
      ref={hostRef}
      className={rootClass}
      style={
        multiline
          ? {
              height: `${height}px`,
              maxHeight: `${maxMultilineHeight}px`,
              resize: userFixedHeightRef.current ? "vertical" : "none",
            }
          : { height: `${INLINE_HEIGHT}px` }
      }
      onMouseDown={(event) => {
        if (!multiline) {
          return;
        }
        const host = hostRef.current;
        if (!(host instanceof HTMLElement)) {
          return;
        }
        const rect = host.getBoundingClientRect();
        const onResizeHandle = event.clientX >= rect.right - 18 && event.clientY >= rect.bottom - 18;
        if (onResizeHandle) {
          userFixedHeightRef.current = true;
        }
      }}
    >
      {showPlaceholder ? <div className="expression-editor-placeholder">{placeholder}</div> : null}
      <Editor
        key={multiline ? "multiline" : "inline"}
        height={multiline ? height : INLINE_HEIGHT}
        language={QUICKER_EXPRESSION_LANGUAGE}
        theme={monacoTheme}
        value={value}
        options={{
          ...buildEditorOptions(multiline),
          readOnly: disabled,
          domReadOnly: disabled
        }}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={handleChange}
        loading={<div className="expression-editor-monaco-loading" aria-hidden="true" />}
      />
    </div>
  );
}
