import assert from "node:assert/strict";
import test from "node:test";
import {
  formatActionProjectsMetaLine,
  parseActionProjectsFromToolData,
  shouldRefreshExplorerAfterTool,
} from "./action-projects.ts";
import { formatLocalToolResult } from "./tool-result.ts";

test("parses action-projects tool payload", () => {
  const parsed = parseActionProjectsFromToolData({
    action: "action-projects",
    success: true,
    root: ".quicker/actions",
    count: 1,
    projects: [
      {
        dirName: "a2adb839-673d-44c5-a725-854700cedb50",
        path: ".quicker/actions/a2adb839-673d-44c5-a725-854700cedb50",
        title: "Test",
        actionId: "a2adb839-673d-44c5-a725-854700cedb50",
      },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed!.projects.length, 1);
  assert.equal(formatActionProjectsMetaLine(parsed!), "1 个动作项目");
});

test("shouldRefreshExplorerAfterTool", () => {
  const projectsOk = formatLocalToolResult({
    action: "action-projects",
    success: true,
    projects: [],
  });
  assert.equal(
    shouldRefreshExplorerAfterTool("workspace_action_projects", projectsOk),
    true,
  );

  const getOk = formatLocalToolResult({
    action: "get",
    workspaceSynced: true,
  });
  assert.equal(shouldRefreshExplorerAfterTool("qkrpc_action_get", getOk), true);
});
