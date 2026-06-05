import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
} from "@codemirror/language";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** Muted palette for shell command panes — low contrast on #0d1117. */
export const terminalShellHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6e7681" },
  { tag: [t.string, t.special(t.string), t.docString], color: "#7a9eb8" },
  {
    tag: [
      t.keyword,
      t.modifier,
      t.operatorKeyword,
      t.controlKeyword,
      t.definitionKeyword,
    ],
    color: "#a88a86",
  },
  { tag: [t.number, t.integer, t.float, t.bool], color: "#6a8faa" },
  {
    tag: [
      t.variableName,
      t.definition(t.variableName),
      t.local(t.variableName),
      t.propertyName,
    ],
    color: "#9a8468",
  },
  {
    tag: [t.className, t.typeName, t.namespace, t.labelName],
    color: "#9a8ab0",
  },
  {
    tag: [
      t.punctuation,
      t.bracket,
      t.operator,
      t.separator,
      t.derefOperator,
      t.arithmeticOperator,
      t.logicOperator,
      t.compareOperator,
    ],
    color: "#8b949e",
  },
  { tag: t.meta, color: "#6e7681" },
  { tag: t.invalid, color: "#c97870" },
]);

export function powerShellCodeMirror(): Extension {
  return new LanguageSupport(StreamLanguage.define(powerShell));
}

export function shellCodeMirror(): Extension {
  return new LanguageSupport(StreamLanguage.define(shell));
}
