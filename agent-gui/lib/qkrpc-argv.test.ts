import assert from "node:assert/strict";
import test from "node:test";
import { argvToInvoke } from "./qkrpc-argv.ts";

test("argvToInvoke maps settings open and pages", () => {
  assert.deepEqual(argvToInvoke(["settings", "pages", "--json"]), {
    op: "settings.pages",
    args: {},
  });
  assert.deepEqual(argvToInvoke(["settings", "links", "--json"]), {
    op: "settings.links",
    args: {},
  });
  assert.deepEqual(
    argvToInvoke([
      "settings",
      "open",
      "--page",
      "recycle-bin",
      "--exe",
      "_global",
      "--json",
    ]),
    {
      op: "settings.open",
      args: {
        page: "recycle-bin",
        preset: undefined,
        query: undefined,
        key: undefined,
        searchText: undefined,
        exe: "_global",
      },
    },
  );
  assert.deepEqual(
    argvToInvoke(["settings", "search", "--query", "圆圈", "--limit", "10", "--json"]),
    {
      op: "settings.list",
      args: { query: "圆圈", scope: undefined, maxResults: 10 },
    },
  );
  assert.deepEqual(
    argvToInvoke(["settings", "list", "--scope", "userSettings", "--json"]),
    {
      op: "settings.list",
      args: { scope: "userSettings", query: undefined, maxResults: undefined },
    },
  );
  assert.deepEqual(
    argvToInvoke([
      "settings",
      "open",
      "--query",
      "回收站",
      "--search-text",
      "test",
      "--json",
    ]),
    {
      op: "settings.open",
      args: {
        page: undefined,
        preset: undefined,
        query: "回收站",
        key: undefined,
        searchText: "test",
        exe: undefined,
      },
    },
  );
  assert.deepEqual(
    argvToInvoke(["settings", "open", "--preset", "hotkeys", "--json"]),
    {
      op: "settings.open",
      args: {
        preset: "hotkeys",
        page: undefined,
        query: undefined,
        key: undefined,
        searchText: undefined,
        exe: undefined,
      },
    },
  );
});

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
    "--html",
    "<p>Intro</p>",
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
      html: "<p>Intro</p>",
      tags: "a,b",
      keywords: "kw1,kw2",
      changelog: "v1.0.1",
      private: true,
      noSubmitReview: true,
    },
  });
});

test("argvToInvoke maps action shared-info get/set", () => {
  assert.deepEqual(
    argvToInvoke([
      "action",
      "shared-info-get",
      "--id",
      "86c72b86-0169-4970-e9de-08dec5dab067",
      "--json",
    ]),
    {
      op: "action.shared-info.get",
      args: { id: "86c72b86-0169-4970-e9de-08dec5dab067" },
    },
  );

  assert.deepEqual(
    argvToInvoke([
      "action",
      "shared-info-set",
      "--code",
      "86c72b86-0169-4970-e9de-08dec5dab067",
      "--html",
      "<p>test</p>",
      "--json",
    ]),
    {
      op: "action.shared-info.set",
      args: {
        id: "86c72b86-0169-4970-e9de-08dec5dab067",
        html: "<p>test</p>",
        htmlFile: undefined,
      },
    },
  );
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

test("argvToInvoke maps action and subprogram search to list ops", () => {
  assert.deepEqual(
    argvToInvoke(["action", "search", "--query", "clip", "--limit", "10", "--json"]),
    {
      op: "action.list",
      args: { query: "clip", scope: undefined, limit: 10, sort: undefined, fields: undefined },
    },
  );
  assert.deepEqual(argvToInvoke(["action", "list", "--sort", "lastEdit", "--json"]), {
    op: "action.list",
    args: { query: undefined, scope: undefined, limit: undefined, sort: "lastEdit", fields: undefined },
  });
  assert.deepEqual(
    argvToInvoke(["action", "list", "--fields", "id,title", "--json"]),
    {
      op: "action.list",
      args: { query: undefined, scope: undefined, limit: undefined, sort: undefined, fields: "id,title" },
    },
  );
  assert.deepEqual(
    argvToInvoke(["subprogram", "search", "--query", "clip", "--json"]),
    {
      op: "subprogram.list",
      args: { query: "clip", limit: undefined },
    },
  );
});

test("argvToInvoke maps trigger commands", () => {
  assert.deepEqual(
    argvToInvoke(["trigger", "events", "--event", "BrowserUrlChanged", "--json"]),
    {
      op: "trigger.events",
      args: { eventType: "BrowserUrlChanged" },
    },
  );
  assert.deepEqual(
    argvToInvoke(["trigger", "list", "--query", "github", "--json"]),
    {
      op: "trigger.list",
      args: { query: "github", eventType: undefined },
    },
  );
  assert.deepEqual(
    argvToInvoke([
      "trigger",
      "add",
      "--event",
      "BrowserUrlChanged",
      "--action",
      "846b4132-ad73-42e8-b2f9-c42fe718ae20",
      "--params",
      '{"UrlPattern":"github\\\\.com"}',
      "--note",
      "auto run on github",
      "--delay",
      "500",
      "--json",
    ]),
    {
      op: "trigger.save",
      args: {
        id: undefined,
        eventType: "BrowserUrlChanged",
        action: "846b4132-ad73-42e8-b2f9-c42fe718ae20",
        actionParam: undefined,
        paramsJson: '{"UrlPattern":"github\\\\.com"}',
        note: "auto run on github",
        filter: undefined,
        machines: undefined,
        debounceMs: undefined,
        throttleMs: undefined,
        delayMs: 500,
        skipFurtherTasks: undefined,
        enabled: undefined,
      },
    },
  );
  assert.deepEqual(
    argvToInvoke([
      "trigger",
      "update",
      "--id",
      "11111111-2222-3333-4444-555555555555",
      "--disabled",
      "--json",
    ]),
    {
      op: "trigger.save",
      args: {
        id: "11111111-2222-3333-4444-555555555555",
        eventType: undefined,
        action: undefined,
        actionParam: undefined,
        paramsJson: undefined,
        note: undefined,
        filter: undefined,
        machines: undefined,
        debounceMs: undefined,
        throttleMs: undefined,
        delayMs: undefined,
        skipFurtherTasks: undefined,
        enabled: false,
      },
    },
  );
  assert.deepEqual(
    argvToInvoke(["trigger", "enable", "--id", "abc", "--json"]),
    { op: "trigger.enable", args: { id: "abc" } },
  );
  assert.deepEqual(
    argvToInvoke(["trigger", "delete", "--id", "abc", "--json"]),
    { op: "trigger.delete", args: { id: "abc" } },
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
