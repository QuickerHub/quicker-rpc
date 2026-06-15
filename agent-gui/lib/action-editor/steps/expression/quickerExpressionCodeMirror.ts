import { cpp } from "@codemirror/lang-cpp";
import { RangeSetBuilder, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

/** `{varKey}` placeholder — identifier only, not C# `{ "a", "b" }` array literals. */
const PLACEHOLDER_RE = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
const PREFIX_RE = /^(\$=|\$\$)/;
const GLOBALS_RE = /\b(_qk|_context|_eval)\b/g;

const prefixMark = Decoration.mark({ class: "cm-quicker-prefix" });
const placeholderMark = Decoration.mark({ class: "cm-quicker-placeholder" });
const globalMark = Decoration.mark({ class: "cm-quicker-global" });

function quickerExpressionDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const text = line.text;

    const prefix = PREFIX_RE.exec(text);
    if (prefix) {
      builder.add(line.from, line.from + prefix[0].length, prefixMark);
    }

    PLACEHOLDER_RE.lastIndex = 0;
    let match = PLACEHOLDER_RE.exec(text);
    while (match) {
      builder.add(line.from + match.index, line.from + match.index + match[0].length, placeholderMark);
      match = PLACEHOLDER_RE.exec(text);
    }

    GLOBALS_RE.lastIndex = 0;
    match = GLOBALS_RE.exec(text);
    while (match) {
      builder.add(line.from + match.index, line.from + match.index + match[0].length, globalMark);
      match = GLOBALS_RE.exec(text);
    }
  }
  return builder.finish();
}

/** C#-like syntax plus Quicker `$=` / `$$`, `{var}`, and runtime globals. */
export function quickerExpressionCodeMirror(): Extension[] {
  return [
    cpp(),
    EditorView.decorations.compute(["doc"], (state) => quickerExpressionDecorations(state)),
  ];
}
