import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  devTempWorkspaceSidebarLabel,
  isDevTempWorkspacePath,
  normalizePathForCompare,
} from "@/lib/dev-temp-workspace.shared";

describe("dev-temp-workspace.shared", () => {
  test("isDevTempWorkspacePath detects agent-gui temp root", () => {
    assert.equal(
      isDevTempWorkspacePath(
        "D:/source/repos/quicker/quicker-rpc/agent-gui/.local/temp-workspaces/ws-abc123",
      ),
      true,
    );
    assert.equal(
      isDevTempWorkspacePath("D:/source/repos/quicker/quicker-rpc"),
      false,
    );
  });

  test("normalizePathForCompare ignores trailing slash and case", () => {
    assert.equal(
      normalizePathForCompare("D:\\Foo\\Bar\\"),
      normalizePathForCompare("d:/foo/bar"),
    );
  });

  test("devTempWorkspaceSidebarLabel prefixes temp marker", () => {
    assert.match(
      devTempWorkspaceSidebarLabel(
        "D:/repo/agent-gui/.local/temp-workspaces/ws-deadbeef",
      ),
      /^临时 · ws-deadbeef$/,
    );
  });
});
