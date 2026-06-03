import assert from "node:assert/strict";
import { test } from "node:test";
import {
  augmentActionGetWithWorkspace,
  buildWorkspaceProjectSummary,
  parseDataJsonOutline,
} from "@/lib/action-project-workflow";
import {
  formatWorkspaceToolMetaLine,
  parseWorkspaceToolDisplay,
} from "@/lib/action-project-display";
import type { ActionProjectManifest } from "@/lib/action-project-workflow";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const sampleManifest: ActionProjectManifest = {
  projectDirectory: ".quicker/actions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  title: "Test",
  editVersion: 3,
  stepCount: 2,
  variableCount: 1,
  fileRefs: [{ path: "files/csscript1.cs", exists: true, paramName: "code" }],
  files: [{ path: "files/csscript1.cs", kind: "file", sizeBytes: 42 }],
};

test("parseDataJsonOutline extracts step keys and variable keys", () => {
  const outline = parseDataJsonOutline(
    JSON.stringify({
      steps: [{ stepRunnerKey: "sys:MsgBox" }, { stepRunnerKey: "sys:delay" }],
      variables: [{ key: "x", type: 0, defaultValue: "1" }],
    }),
  );
  assert.ok(!("error" in outline));
  if ("error" in outline) return;
  assert.deepEqual(outline.stepsOutline, [
    { index: 0, stepRunnerKey: "sys:MsgBox" },
    { index: 1, stepRunnerKey: "sys:delay" },
  ]);
  assert.deepEqual(outline.variableKeys, ["x"]);
});

test("buildWorkspaceProjectSummary is compact (no layout/howToEdit)", () => {
  const summary = buildWorkspaceProjectSummary(sampleManifest);
  assert.equal(summary.projectDirectory.endsWith(sampleManifest.actionId), true);
  assert.equal(summary.stepCount, 2);
  assert.equal(summary.fileRefCount, 1);
  assert.equal("layout" in summary, false);
  assert.equal("howToEdit" in summary, false);
  assert.equal("files" in summary, false);
});

test("parseWorkspaceToolDisplay reads nested action get payload", () => {
  const display = parseWorkspaceToolDisplay({
    payload: {
      actionId: sampleManifest.actionId,
      editVersion: 3,
      workspaceSynced: true,
      workspaceProject: buildWorkspaceProjectSummary(sampleManifest),
    },
  });
  assert.ok(display);
  assert.equal(display!.title, "Test");
  assert.equal(display!.stepCount, 2);
  assert.equal(formatWorkspaceToolMetaLine(display!), "Test · v3 · 2 步");
});

test("augmentActionGetWithWorkspace adds workspaceProject and strips compressed body", () => {
  const getResult: QkrpcRunResult = {
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    truncated: false,
    parsed: {
      ok: true,
      action: "get",
      payload: {
        success: true,
        actionId: sampleManifest.actionId,
        editVersion: 3,
        compressed: {
          title: "Test",
          steps: [{ stepId: "s1", huge: "body" }],
          variables: [],
        },
      },
    },
  };

  const augmented = augmentActionGetWithWorkspace(getResult, {
    ok: true,
    manifest: sampleManifest,
  });
  assert.equal(augmented.ok, true);
  const data = augmented.data as {
    payload?: {
      workspaceSynced?: boolean;
      workspaceProject?: { projectDirectory: string; howToEdit?: unknown };
      compressed?: { steps?: unknown; note?: string };
    };
  };
  assert.equal(data.payload?.workspaceSynced, true);
  assert.equal(
    data.payload?.workspaceProject?.projectDirectory,
    sampleManifest.projectDirectory,
  );
  assert.equal(data.payload?.compressed?.steps, undefined);
  assert.equal(data.payload?.compressed?.note, undefined);
  assert.equal(data.payload?.workspaceProject?.howToEdit, undefined);
});
