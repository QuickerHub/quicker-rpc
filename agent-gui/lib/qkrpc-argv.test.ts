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

test("argvToInvoke maps action validate and apply for workspace save", () => {
  assert.deepEqual(
    argvToInvoke([
      "action",
      "validate",
      "--dir",
      "D:\\ws\\.quicker\\actions\\846b4132-ad73-42e8-b2f9-c42fe718ae20",
      "--json",
    ]),
    {
      op: "action.validate",
      args: {
        id: undefined,
        dir: "D:\\ws\\.quicker\\actions\\846b4132-ad73-42e8-b2f9-c42fe718ae20",
      },
    },
  );
  assert.deepEqual(
    argvToInvoke([
      "action",
      "apply",
      "--id",
      "846b4132-ad73-42e8-b2f9-c42fe718ae20",
      "--dir",
      ".quicker/actions/846b4132-ad73-42e8-b2f9-c42fe718ae20",
      "--force",
      "--json",
    ]),
    {
      op: "action.apply",
      args: {
        id: "846b4132-ad73-42e8-b2f9-c42fe718ae20",
        dir: ".quicker/actions/846b4132-ad73-42e8-b2f9-c42fe718ae20",
        expectedEditVersion: undefined,
        force: true,
      },
    },
  );
});

test("argvToInvoke maps subprogram export and import", () => {
  assert.deepEqual(
    argvToInvoke([
      "subprogram",
      "export",
      "--id",
      "MySub",
      "--dir",
      ".quicker/subprograms/MySub",
      "--json",
    ]),
    {
      op: "subprogram.export",
      args: { id: "MySub", dir: ".quicker/subprograms/MySub" },
    },
  );
  assert.deepEqual(
    argvToInvoke([
      "subprogram",
      "import",
      "--dir",
      "D:\\ws\\.quicker\\subprograms\\MySub",
      "--expected-edit-version",
      "3",
      "--force",
      "--json",
    ]),
    {
      op: "subprogram.import",
      args: {
        dir: "D:\\ws\\.quicker\\subprograms\\MySub",
        expectedEditVersion: 3,
        force: true,
      },
    },
  );
});

test("argvToInvoke maps process ensure with move-actions", () => {
  const invoke = argvToInvoke([
    "process",
    "ensure",
    "--exe",
    "_ceacore_run",
    "--name",
    "CeaCore Run",
    "--profile-prefix",
    "@CeaCore ",
    "--collect-subprogram",
    "CeaCore_Run",
    "--move-actions",
    "--move-any",
    "--json",
  ]);
  assert.deepEqual(invoke, {
    op: "process.ensure",
    args: {
      exeFile: "_ceacore_run",
      displayName: "CeaCore Run",
      profileNamePrefix: "@CeaCore ",
      collectSubProgramName: "CeaCore_Run",
      moveActions: true,
      moveAny: true,
    },
  });
});
