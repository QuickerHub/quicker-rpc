import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorState } from "@codemirror/state";
import {
  computeCodeMirrorEditorStats,
  statsFromTextContent,
} from "./codemirror-editor-stats.ts";

test("statsFromTextContent counts lines and characters", () => {
  const stats = statsFromTextContent("a\nb\n");
  assert.equal(stats.lineCount, 3);
  assert.equal(stats.charCount, 4);
  assert.equal(stats.selectionCharCount, 0);
});

test("computeCodeMirrorEditorStats reflects cursor and selection", () => {
  const state = EditorState.create({
    doc: "one\ntwo\nthree",
    selection: { anchor: 4, head: 8 },
  });
  const stats = computeCodeMirrorEditorStats(state);
  assert.equal(stats.lineCount, 3);
  assert.equal(stats.charCount, 13);
  assert.equal(stats.selectionCharCount, 4);
  assert.equal(stats.cursorLine, 3);
  assert.equal(stats.cursorColumn, 1);
});
