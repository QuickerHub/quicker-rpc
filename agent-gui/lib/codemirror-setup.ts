import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  drawSelection,
} from "@codemirror/view";
import { createInterpolationLintExtension } from "@/lib/codemirror-interpolation-lint";
import { quickerTextCodeMirror } from "@/lib/quicker-text-codemirror";
import {
  powerShellCodeMirror,
  shellCodeMirror,
  terminalShellHighlightStyle,
} from "@/lib/shell-command-codemirror";
import { terminalTranscriptCodeMirror } from "@/lib/terminal-transcript-codemirror";
import { guessFileLanguage } from "@/lib/workspace-file-tool";

/** Maps Lezer highlight tags to theme.css `--code-token-*` tokens (VS Code palette). */
export const workspaceHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--code-token-comment)" },
  { tag: [t.string, t.special(t.string), t.docString], color: "var(--code-token-string)" },
  { tag: [t.regexp, t.url], color: "var(--code-token-string)" },
  {
    tag: [
      t.keyword,
      t.modifier,
      t.operatorKeyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.self,
      t.null,
      t.atom,
    ],
    color: "var(--code-token-keyword)",
  },
  { tag: [t.number, t.integer, t.float, t.bool, t.unit, t.color], color: "var(--code-token-number)" },
  {
    tag: [
      t.propertyName,
      t.definition(t.propertyName),
      t.variableName,
      t.definition(t.variableName),
      t.local(t.variableName),
      t.name,
    ],
    color: "var(--code-token-property)",
  },
  {
    tag: [
      t.className,
      t.tagName,
      t.labelName,
      t.typeName,
      t.namespace,
      t.attributeName,
    ],
    color: "var(--code-token-selector)",
  },
  {
    tag: [
      t.punctuation,
      t.bracket,
      t.squareBracket,
      t.paren,
      t.separator,
      t.operator,
      t.derefOperator,
      t.updateOperator,
      t.logicOperator,
      t.bitwiseOperator,
      t.compareOperator,
      t.arithmeticOperator,
    ],
    color: "var(--code-token-punctuation)",
  },
  { tag: [t.meta, t.processingInstruction], color: "var(--code-token-comment)" },
  { tag: t.attributeValue, color: "var(--code-token-string)" },
  { tag: t.escape, color: "var(--code-token-keyword)" },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4], color: "var(--code-token-keyword)", fontWeight: "600" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.invalid, color: "var(--err)" },
]);

export function workspaceCodeMirrorTheme(): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--code-text)",
      fontSize: "0.72rem",
      fontFamily: "var(--font-mono)",
    },
    ".cm-content": {
      padding: "0.4rem 0.45rem",
      caretColor: "transparent",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
      lineHeight: "1.45",
      fontVariantLigatures: "none",
    },
    ".cm-gutters": {
      backgroundColor: "color-mix(in srgb, var(--text) 4%, transparent)",
      color: "color-mix(in srgb, var(--text) 38%, transparent)",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--text) 12%, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--text)",
    },
    ".cm-specialChar": {
      color: "var(--muted)",
      backgroundColor: "color-mix(in srgb, var(--warn) 16%, transparent)",
      borderRadius: "2px",
      padding: "0 1px",
    },
    /* Unified merge view — background + gutter bar; no underline on inserts */
    ".cm-changedLine, .cm-insertedLine": {
      textDecoration: "none",
      backgroundColor: "color-mix(in srgb, var(--code-diff-insert) 10%, transparent)",
      boxShadow:
        "inset 3px 0 0 color-mix(in srgb, var(--code-diff-insert) 70%, transparent)",
    },
    ".cm-changedText, .cm-insertedText": {
      textDecoration: "none",
      backgroundColor: "color-mix(in srgb, var(--code-diff-insert) 22%, transparent)",
      borderRadius: "2px",
    },
    ".cm-deletedChunk, .cm-deletedLine": {
      textDecoration: "none",
      backgroundColor: "color-mix(in srgb, var(--code-diff-remove) 10%, transparent)",
      boxShadow:
        "inset 3px 0 0 color-mix(in srgb, var(--code-diff-remove) 65%, transparent)",
    },
    ".cm-deletedText": {
      backgroundColor: "color-mix(in srgb, var(--code-diff-remove) 18%, transparent)",
      textDecoration: "line-through",
      textDecorationColor: "color-mix(in srgb, var(--code-diff-remove) 85%, transparent)",
    },
    ".cm-deletedLineGutter": {
      color: "var(--code-diff-remove)",
      backgroundColor: "color-mix(in srgb, var(--code-diff-remove) 14%, transparent)",
    },
    ".cm-changedLineGutter, .cm-insertedLineGutter": {
      color: "var(--code-diff-insert)",
      backgroundColor: "color-mix(in srgb, var(--code-diff-insert) 14%, transparent)",
    },
    ".cm-line:has(.cm-diff-collapsed-marker)": {
      color: "color-mix(in srgb, var(--foreground) 48%, transparent)",
      fontStyle: "italic",
      backgroundColor: "color-mix(in srgb, var(--foreground) 6%, transparent)",
    },
    ".cm-mergeA .cm-changedLine, .cm-mergeB .cm-changedLine": {
      textDecoration: "none",
      backgroundColor: "color-mix(in srgb, var(--code-diff-insert) 10%, transparent)",
      boxShadow:
        "inset 3px 0 0 color-mix(in srgb, var(--code-diff-insert) 70%, transparent)",
    },
  });
}

/** Pass to @uiw/react-codemirror `theme` — avoids cm-theme-light wrapper + built-in palette. */
export const workspaceCodeMirrorUiTheme = workspaceCodeMirrorTheme();

export function workspaceSyntaxHighlighting(): Extension {
  return syntaxHighlighting(workspaceHighlightStyle, { fallback: true });
}

export function readonlyCodeMirrorExtensions(): Extension[] {
  return [
    drawSelection(),
    workspaceSyntaxHighlighting(),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    workspaceCodeMirrorTheme(),
  ];
}

/** Shell command pane on dark terminal background (#161b22). */
export function readonlyTerminalCommandCodeMirrorExtensions(): Extension[] {
  return [
    drawSelection(),
    syntaxHighlighting(terminalShellHighlightStyle, { fallback: true }),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        backgroundColor: "transparent",
        color: "#8b949e",
        fontSize: "0.78rem",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontWeight: "400",
      },
      ".cm-content": {
        padding: 0,
        caretColor: "transparent",
      },
      ".cm-scroller": {
        overflow: "visible",
        fontFamily: "inherit",
        lineHeight: "1.42",
      },
      ".cm-cursor": { display: "none !important" },
    }),
  ];
}

/** Terminal output body: monospace plain text on dark background, no syntax tokens. */
export function readonlyPlainCodeMirrorExtensions(): Extension[] {
  return [
    drawSelection(),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        backgroundColor: "transparent",
        color: "#8b949e",
        fontWeight: "400",
      },
      ".cm-content": {
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: "0.78rem",
        lineHeight: "1.42",
        fontWeight: "400",
      },
      ".cm-cursor": { display: "none !important" },
    }),
  ];
}

export function getCodeMirrorLanguageExtension(
  path: string,
  language?: string,
): Extension {
  const lang = language ?? guessFileLanguage(path);
  switch (lang) {
    case "json":
      return json();
    case "css":
      return css();
    case "markdown":
      return markdown();
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "python":
      return python();
    case "html":
      return html();
    case "xml":
    case "svg":
      return xml();
    case "yaml":
      return yaml();
    case "rust":
      return rust();
    case "go":
      return go();
    case "java":
    case "kotlin":
      return java();
    case "php":
      return php();
    case "sql":
      return sql();
    case "csharp":
      return cpp();
    case "text":
      return quickerTextCodeMirror();
    case "terminal":
      return terminalTranscriptCodeMirror();
    case "powershell":
      return powerShellCodeMirror();
    case "bash":
    case "shell":
      return shellCodeMirror();
    default:
      return [];
  }
}

export function buildPreviewCodeMirrorExtensions(
  path: string,
  options?: {
    language?: string;
    lineNumbers?: boolean;
    /** Monospace plain text without syntax highlighting (terminal stdout). */
    plain?: boolean;
    /** Dark terminal command row (shell_exec command pane). */
    terminalDark?: boolean;
    /** Source for $$ interpolation lint (defaults to editor doc). */
    lintSourceText?: string;
  },
): Extension[] {
  const extensions: Extension[] = options?.plain
    ? [...readonlyPlainCodeMirrorExtensions()]
    : options?.terminalDark
      ? [
        ...readonlyTerminalCommandCodeMirrorExtensions(),
        getCodeMirrorLanguageExtension(path, options?.language),
      ]
      : [
        ...readonlyCodeMirrorExtensions(),
        getCodeMirrorLanguageExtension(path, options?.language),
      ];
  if (options?.lineNumbers) {
    extensions.push(lineNumbers());
  }
  const interpolationLint = createInterpolationLintExtension(
    options?.lintSourceText ?? "",
    path,
  );
  if (interpolationLint) {
    extensions.push(interpolationLint);
  }
  return extensions;
}
