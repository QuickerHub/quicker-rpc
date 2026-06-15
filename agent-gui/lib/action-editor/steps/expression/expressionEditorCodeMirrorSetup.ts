import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap } from "@codemirror/view";
import { workspaceHighlightStyle } from "@/lib/codemirror-setup";
import { quickerExpressionCodeMirror } from "./quickerExpressionCodeMirror";

export function expressionEditorCodeMirrorTheme(multiline: boolean): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--ad-bg-input)",
      color: "var(--ad-fg)",
      fontSize: "12px",
      fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-content": {
      padding: "0 4px",
      caretColor: "var(--ad-fg-input, var(--ad-fg))",
      minHeight: "18px",
    },
    ".cm-content ::selection": {
      backgroundColor: "transparent !important",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--ad-fg-input, var(--ad-fg))",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    "&.cm-focused .cm-activeLine": {
      backgroundColor: "var(--ad-editor-active-line-bg)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--ad-editor-selection-bg-inactive) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--ad-editor-selection-bg) !important",
    },
    ".cm-quicker-prefix": {
      color: "var(--code-token-keyword)",
      fontWeight: "600",
    },
    ".cm-quicker-placeholder": {
      color: "var(--code-token-selector)",
      fontWeight: "600",
    },
    ".cm-quicker-global": {
      color: "var(--code-token-selector)",
    },
    ".cm-scroller": {
      overflowX: "auto",
      overflowY: multiline ? "auto" : "hidden",
      lineHeight: "18px",
      fontFamily: "inherit",
      fontVariantLigatures: "none",
      overscrollBehavior: "auto",
    },
  });
}

export function buildExpressionEditorExtensions(options: {
  multiline: boolean;
  readOnly?: boolean;
  onLayout?: (view: EditorView) => void;
}): Extension[] {
  const extensions: Extension[] = [
    ...quickerExpressionCodeMirror(),
    syntaxHighlighting(workspaceHighlightStyle),
    expressionEditorCodeMirrorTheme(options.multiline),
    drawSelection(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorState.tabSize.of(4),
    EditorView.editable.of(!options.readOnly),
  ];

  if (options.multiline) {
    extensions.push(EditorView.lineWrapping, highlightActiveLine());
  }

  if (options.onLayout) {
    const onLayout = options.onLayout;
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.geometryChanged) {
          onLayout(update.view);
        }
      }),
    );
  }

  return extensions;
}
