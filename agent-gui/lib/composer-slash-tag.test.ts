import test from "node:test";
import assert from "node:assert/strict";
import {
  expandSlashTagsInUserText,
  formatSlashTagMarkup,
  slashTagFromAttrs,
} from "@/lib/composer-slash-tag";
import {
  canSendComposedMessage,
  parseUserMessageSegments,
} from "@/lib/compose-user-message";

test("slash tag markup round-trips through parseUserMessageSegments", () => {
  const markup = `${formatSlashTagMarkup({ kind: "command", name: "frontend-check" })} run it`;
  const segments = parseUserMessageSegments(markup);
  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.type, "slash-tag");
  if (segments[0]?.type === "slash-tag") {
    assert.equal(segments[0].ref.name, "frontend-check");
  }
  assert.equal(canSendComposedMessage(markup), true);
});

test("expandSlashTagsInUserText expands command tag to slash wire", () => {
  const markup = formatSlashTagMarkup({ kind: "skill", name: "qkrpc" });
  assert.equal(
    expandSlashTagsInUserText(markup),
    "请加载并遵循 skill「qkrpc」：",
  );
});

test("slashTagFromAttrs reads data attributes", () => {
  const ref = slashTagFromAttrs({
    "data-slash-kind": "agent",
    "data-slash-name": "explore",
  });
  assert.deepEqual(ref, { kind: "agent", name: "explore" });
});
