import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { countLines } from "@/lib/workspace-file-tool";

export type CodeMirrorEditorStats = {
  lineCount: number;
  charCount: number;
  selectionCharCount: number;
  cursorLine: number;
  cursorColumn: number;
};

export function statsFromTextContent(content: string): CodeMirrorEditorStats {
  const lineCount = countLines(content);
  return {
    lineCount,
    charCount: content.length,
    selectionCharCount: 0,
    cursorLine: lineCount > 0 ? lineCount : 1,
    cursorColumn: 1,
  };
}

export function computeCodeMirrorEditorStats(state: EditorState): CodeMirrorEditorStats {
  const doc = state.doc;
  const head = state.selection.main.head;
  const line = doc.lineAt(head);
  const selection = state.selection.main;
  return {
    lineCount: doc.lines,
    charCount: doc.length,
    selectionCharCount: selection.empty ? 0 : selection.to - selection.from,
    cursorLine: line.number,
    cursorColumn: head - line.from + 1,
  };
}

export function createCodeMirrorStatsExtension(
  onChange: (stats: CodeMirrorEditorStats) => void,
): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged || update.selectionSet) {
      onChange(computeCodeMirrorEditorStats(update.state));
    }
  });
}
