import type * as Monaco from "monaco-editor";
import { conf as csharpConf, language as csharpLanguage } from "monaco-editor/esm/vs/basic-languages/csharp/csharp.js";

const LANGUAGE_ID = "quicker-expression";

/** `{varKey}` placeholder — not `{ var }` with surrounding spaces. */
const PLACEHOLDER_RE = /\{[^{}\s][^{}]*\}/;
const PREFIX_RE = /^(\$=|\$\$)/;
const GLOBALS_RE = /\b(_qk|_context|_eval)\b/;

let registered = false;

export function registerQuickerMonaco(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  const csRoot = csharpLanguage.tokenizer.root as Monaco.languages.IMonarchLanguageRule[];

  monaco.languages.register({ id: LANGUAGE_ID });
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, csharpConf);
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    ...csharpLanguage,
    tokenizer: {
      ...csharpLanguage.tokenizer,
      root: [
        [PREFIX_RE, "keyword.control.prefix"],
        [PLACEHOLDER_RE, "variable.quicker"],
        [GLOBALS_RE, "variable.predefined"],
        ...csRoot
      ]
    }
  });

  monaco.editor.defineTheme("quicker-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.control.prefix", foreground: "C586C0", fontStyle: "bold" },
      { token: "variable.quicker", foreground: "E6C07B", fontStyle: "bold" },
      { token: "variable.predefined", foreground: "4EC9B0" }
    ],
    colors: {
      // Match --ad-bg-input; must be opaque (sticky scroll / overlays bleed if alpha=0).
      "editor.background": "#242424",
      "editor.foreground": "#efefef",
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.selectionBackground": "#35506b",
      "editor.inactiveSelectionBackground": "#2a3640",
      "editorCursor.foreground": "#efefef",
      "editorWidget.background": "#2b2b2b",
      "editorSuggestWidget.background": "#2b2b2b",
      "editorStickyScroll.background": "#242424",
      "editorStickyScroll.border": "#3c3c3c",
      "editorStickyScroll.shadow": "#00000040",
      "editorStickyScrollHover.background": "#2e2e2e",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#4a4a4a80",
      "scrollbarSlider.hoverBackground": "#5a5a5a99"
    }
  });

  monaco.editor.defineTheme("quicker-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword.control.prefix", foreground: "AF00DB", fontStyle: "bold" },
      { token: "variable.quicker", foreground: "8A5A00", fontStyle: "bold" },
      { token: "variable.predefined", foreground: "267F99" }
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1a1a1a",
      "editor.lineHighlightBackground": "#00000006",
      "editor.selectionBackground": "#b8d4f0",
      "editor.inactiveSelectionBackground": "#d6e8f7",
      "editorCursor.foreground": "#1a1a1a",
      "editorWidget.background": "#ffffff",
      "editorSuggestWidget.background": "#ffffff",
      "editorStickyScroll.background": "#ffffff",
      "editorStickyScroll.border": "#c4c4c4",
      "editorStickyScroll.shadow": "#00000014",
      "editorStickyScrollHover.background": "#f5f5f5",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#b8b8b880",
      "scrollbarSlider.hoverBackground": "#9a9a9a99"
    }
  });
}

export function getQuickerMonacoTheme(appTheme: "dark" | "light"): string {
  return appTheme === "light" ? "quicker-light" : "quicker-dark";
}

export const QUICKER_EXPRESSION_LANGUAGE = LANGUAGE_ID;
