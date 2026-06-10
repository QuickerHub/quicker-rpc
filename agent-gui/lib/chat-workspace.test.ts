import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addThread,
  addWorkspace,
  defaultChatStore,
  normalizeLoadedStore,
  selectWorkspace,
  threadsForWorkspace,
} from "@/lib/chat-store";
import { defaultWorkspaceLabel, remapThreadsToKnownWorkspaces } from "@/lib/chat-workspace";

test("defaultChatStore includes one workspace and thread linkage", () => {
  const store = defaultChatStore();
  assert.equal(store.workspaces.length, 1);
  assert.equal(store.activeWorkspaceId, store.workspaces[0]!.id);
  assert.equal(store.threads[0]!.workspaceId, store.activeWorkspaceId);
});

test("addWorkspace creates isolated thread list", () => {
  const base = defaultChatStore();
  const withMessage = {
    ...base,
    threads: base.threads.map((thread) => ({
      ...thread,
      messages: [
        {
          id: "m1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "hello" }],
        },
      ],
      messageCount: 1,
    })),
  };
  const next = addWorkspace(withMessage, "D:\\projects\\demo");
  assert.equal(next.workspaces.length, 2);
  assert.equal(threadsForWorkspace(next.threads, next.activeWorkspaceId).length, 1);
  assert.equal(
    threadsForWorkspace(next.threads, withMessage.activeWorkspaceId).length,
    1,
  );
});

test("selectWorkspace switches active thread scope", () => {
  const base = defaultChatStore();
  const firstWorkspaceId = base.activeWorkspaceId;
  const withSecond = addWorkspace(base, "D:\\other");
  const secondWorkspaceId = withSecond.activeWorkspaceId;
  assert.notEqual(firstWorkspaceId, secondWorkspaceId);

  const back = selectWorkspace(withSecond, firstWorkspaceId);
  assert.equal(back.activeWorkspaceId, firstWorkspaceId);
  assert.equal(
    back.threads.find((thread) => thread.id === back.activeThreadId)?.workspaceId,
    firstWorkspaceId,
  );
});

test("normalizeLoadedStore migrates legacy single workingDirectory", () => {
  const legacy = {
    version: 3 as const,
    activeThreadId: "t1",
    activeWorkspaceId: "",
    workspaces: [] as [],
    threads: [
      {
        id: "t1",
        title: "旧对话",
        messages: [],
        updatedAt: 1,
        messageCount: 0,
      },
    ],
    openTabIds: ["t1"],
    workingDirectory: "D:\\legacy",
  };
  const normalized = normalizeLoadedStore(legacy);
  assert.equal(normalized.workspaces.length, 1);
  assert.equal(normalized.workspaces[0]!.rootPath, "D:\\legacy");
  assert.equal(normalized.threads[0]!.workspaceId, normalized.activeWorkspaceId);
});

test("normalizeLoadedStore repairs store missing workspaces field", () => {
  const partial = {
    version: 3 as const,
    activeThreadId: "t1",
    activeWorkspaceId: "",
    threads: [
      {
        id: "t1",
        title: "对话",
        messages: [],
        updatedAt: 1,
        messageCount: 0,
      },
    ],
    openTabIds: ["t1"],
    workingDirectory: "",
  } as unknown as import("@/lib/chat-store").ChatStoreData;

  const normalized = normalizeLoadedStore(partial);
  assert.equal(normalized.workspaces.length, 1);
  assert.ok(normalized.activeWorkspaceId);
  assert.equal(normalized.threads[0]!.workspaceId, normalized.activeWorkspaceId);
});

test("remapThreadsToKnownWorkspaces fixes stale v1 workspace ids", () => {
  const store = defaultChatStore();
  const staleWorkspaceId = "stale-workspace-id";
  const withStale = {
    ...store,
    threads: store.threads.map((thread) => ({
      ...thread,
      workspaceId: staleWorkspaceId,
    })),
  };
  const remapped = remapThreadsToKnownWorkspaces(withStale);
  assert.equal(remapped.threads[0]!.workspaceId, store.activeWorkspaceId);
});

test("defaultWorkspaceLabel prefers label then folder name", () => {
  assert.equal(
    defaultWorkspaceLabel({ rootPath: "D:\\projects\\quicker-rpc", label: "RPC" }),
    "RPC",
  );
  assert.equal(
    defaultWorkspaceLabel({ rootPath: "D:\\projects\\quicker-rpc" }),
    "quicker-rpc",
  );
  assert.equal(defaultWorkspaceLabel({ rootPath: "" }, "默认"), "默认");
});
