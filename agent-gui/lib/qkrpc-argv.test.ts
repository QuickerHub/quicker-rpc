import assert from "node:assert/strict";
import test from "node:test";
import { argvToInvoke } from "./qkrpc-argv.ts";

test("argvToInvoke maps action publish with share metadata", () => {
  const invoke = argvToInvoke([
    "action",
    "publish",
    "--id",
    "846b4132-ad73-42e8-b2f9-c42fe718ae20",
    "--title",
    "My Action",
    "--description",
    "Does things",
    "--share-note",
    "# Intro",
    "--tags",
    "a,b",
    "--keywords",
    "kw1,kw2",
    "--changelog",
    "v1.0.1",
    "--private",
    "--no-submit-review",
    "--json",
  ]);
  assert.deepEqual(invoke, {
    op: "action.publish",
    args: {
      id: "846b4132-ad73-42e8-b2f9-c42fe718ae20",
      title: "My Action",
      description: "Does things",
      note: "# Intro",
      tags: "a,b",
      keywords: "kw1,kw2",
      changelog: "v1.0.1",
      private: true,
      noSubmitReview: true,
    },
  });
});

test("argvToInvoke maps action update for legacy compat", () => {
  const invoke = argvToInvoke([
    "action",
    "update",
    "--id",
    "f5c76108-3ce9-433f-8cd0-8f0d9c562052",
    "--changelog",
    "Fix bug",
    "--json",
  ]);
  assert.deepEqual(invoke, {
    op: "action.update",
    args: {
      id: "f5c76108-3ce9-433f-8cd0-8f0d9c562052",
      changelog: "Fix bug",
    },
  });
});
