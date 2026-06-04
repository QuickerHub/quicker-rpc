import {
  RangeSetBuilder,
  StateField,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  lineNumbers,
} from "@codemirror/view";
import {
  firstChangedDisplayLineNumber,
  isCollapsedDiffContextLine,
  lineDiffGutterSymbol,
  type LineDiffKind,
} from "@/lib/file-line-diff";

function buildDiffLineDecorations(
  lineKinds: readonly LineDiffKind[],
  doc: Text,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const lineCount = Math.min(lineKinds.length, doc.lines);

  for (let i = 0; i < lineCount; i++) {
    const line = doc.line(i + 1);
    const kind = lineKinds[i];
    let className = "cm-diff-line--equal";
    if (isCollapsedDiffContextLine(line.text)) {
      className = "cm-diff-line--collapsed";
    } else if (kind === "insert") {
      className = "cm-diff-line--insert";
    } else if (kind === "delete") {
      className = "cm-diff-line--delete";
    }
    builder.add(line.from, line.from, Decoration.line({ class: className }));
  }

  return builder.finish();
}

/** Align doc line top with scroller viewport (lineBlockAt can be ~4px short vs DOM). */
function resolveDocLineElement(
  view: EditorView,
  lineNumber: number,
): HTMLElement | null {
  const docLine = Math.min(Math.max(1, lineNumber), view.state.doc.lines);
  const content = view.scrollDOM.querySelector(".cm-content");
  if (content) {
    const lineEl = content.querySelector(
      `:scope > .cm-line:nth-child(${docLine})`,
    );
    if (lineEl instanceof HTMLElement) {
      return lineEl;
    }
  }
  const line = view.state.doc.line(docLine);
  const dom = view.domAtPos(line.from);
  let node: Node = dom.node;
  if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
    node = node.parentNode;
  }
  const lineEl = node instanceof HTMLElement ? node.closest(".cm-line") : null;
  return lineEl instanceof HTMLElement ? lineEl : null;
}

function resolveDocLineScrollTop(view: EditorView, lineNumber: number): number | null {
  const lineEl = resolveDocLineElement(view, lineNumber);
  if (lineEl) {
    return lineEl.offsetTop;
  }
  const docLine = Math.min(Math.max(1, lineNumber), view.state.doc.lines);
  return view.lineBlockAt(view.state.doc.line(docLine).from).top;
}

export function scrollEditorToDocLine(view: EditorView, lineNumber: number): void {
  const scrollTop = resolveDocLineScrollTop(view, lineNumber);
  if (scrollTop == null) return;
  view.scrollDOM.scrollTop = scrollTop;
}

const COMPACT_DIFF_SCROLL_RETRY_MS = [0, 20, 80, 200, 400, 800] as const;

function resolveFirstChangeLineNumber(
  view: EditorView,
  lineKinds: readonly LineDiffKind[],
): number {
  const content = view.scrollDOM.querySelector(".cm-content");
  if (content) {
    const lines = content.querySelectorAll(":scope > .cm-line");
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (
        el.classList.contains("cm-diff-line--insert")
        || el.classList.contains("cm-diff-line--delete")
      ) {
        return i + 1;
      }
    }
  }
  return firstChangedDisplayLineNumber(lineKinds);
}

function scrollCompactPreviewToFirstChange(
  view: EditorView,
  lineKinds: readonly LineDiffKind[],
): boolean {
  const lineNo = resolveFirstChangeLineNumber(view, lineKinds);
  const lineEl = resolveDocLineElement(view, lineNo);
  if (!lineEl) return false;
  view.scrollDOM.scrollTop = lineEl.offsetTop;
  return Math.abs(lineEl.offsetTop - view.scrollDOM.scrollTop) < 0.5;
}

function createCompactPreviewScrollExtension(
  lineKinds: readonly LineDiffKind[],
): Extension {
  return ViewPlugin.fromClass(
    class {
      private done = false;
      private timers: ReturnType<typeof setTimeout>[] = [];

      constructor(private view: EditorView) {
        this.schedule();
      }

      destroy() {
        for (const id of this.timers) clearTimeout(id);
      }

      private schedule() {
        for (const ms of COMPACT_DIFF_SCROLL_RETRY_MS) {
          this.timers.push(setTimeout(() => this.tryScroll(), ms));
        }
        const observer = new MutationObserver(() => {
          if (this.tryScroll()) observer.disconnect();
        });
        observer.observe(this.view.scrollDOM, { childList: true, subtree: true });
        this.timers.push(setTimeout(() => observer.disconnect(), 1200));
      }

      private tryScroll(): boolean {
        if (this.done) return true;
        if (scrollCompactPreviewToFirstChange(this.view, lineKinds)) {
          this.done = true;
        }
        return this.done;
      }
    },
  );
}

export function createDiffLineKindsExtension(
  lineKinds: readonly LineDiffKind[],
  options?: { scrollToFirstChange?: boolean },
): Extension {
  const kinds = [...lineKinds];
  const decorationsField = StateField.define<DecorationSet>({
    create(state) {
      return buildDiffLineDecorations(kinds, state.doc);
    },
    update(decorations, transaction) {
      if (transaction.docChanged) {
        return buildDiffLineDecorations(kinds, transaction.state.doc);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  const extensions: Extension[] = [
    decorationsField,
    lineNumbers({
      formatNumber: (lineNo) => lineDiffGutterSymbol(kinds[lineNo - 1] ?? "equal"),
    }),
    EditorView.theme({
      ".cm-diff-line--insert": {
        backgroundColor: "color-mix(in srgb, var(--code-diff-insert) 14%, transparent)",
        boxShadow:
          "inset 3px 0 0 color-mix(in srgb, var(--code-diff-insert) 65%, transparent)",
      },
      ".cm-diff-line--delete": {
        backgroundColor: "color-mix(in srgb, var(--code-diff-remove) 12%, transparent)",
        boxShadow:
          "inset 3px 0 0 color-mix(in srgb, var(--code-diff-remove) 60%, transparent)",
        textDecoration: "line-through",
        textDecorationColor:
          "color-mix(in srgb, var(--code-diff-remove) 70%, transparent)",
      },
      ".cm-diff-line--collapsed": {
        color: "color-mix(in srgb, var(--foreground) 48%, transparent)",
        fontStyle: "italic",
        backgroundColor: "color-mix(in srgb, var(--foreground) 6%, transparent)",
      },
      ".cm-gutters .cm-lineNumbers .cm-gutterElement": {
        minWidth: "1.6em",
        fontWeight: "600",
      },
    }),
  ];
  if (options?.scrollToFirstChange) {
    extensions.push(createCompactPreviewScrollExtension(kinds));
  }
  return extensions;
}
