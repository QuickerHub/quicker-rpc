import assert from "node:assert/strict";
import { test } from "node:test";
import {
  focusActionDesignerInStore,
  threadMatchesActionDesigner,
  threadsForActionDesigner,
} from "@/lib/action-designer-thread";
import { defaultChatStore } from "@/lib/chat-store";

const designerA = { entityId: "action-guid-1", isSubProgram: false };
const designerB = { entityId: "sub-guid-2", isSubProgram: true };

test("threadMatchesActionDesigner compares entity id case-insensitively", () => {
  assert.equal(
    threadMatchesActionDesigner(
      { actionDesigner: { entityId: "Action-GUID-1", isSubProgram: false } },
      designerA,
    ),
    true,
  );
  assert.equal(
    threadMatchesActionDesigner(
      { actionDesigner: { entityId: "action-guid-1", isSubProgram: true } },
      designerA,
    ),
    false,
  );
});

test("focusActionDesignerInStore creates a tagged thread when none exist", () => {
  const next = focusActionDesignerInStore(defaultChatStore(), designerA);
  assert.equal(threadsForActionDesigner(next.threads, designerA).length, 1);
  assert.equal(next.activeThreadId, next.openTabIds[0]);
});

test("focusActionDesignerInStore scopes tabs to the current designer", () => {
  const base = focusActionDesignerInStore(defaultChatStore(), designerA);
  const withB = focusActionDesignerInStore(
    {
      ...base,
      threads: [
        ...base.threads,
        {
          id: "thread-b",
          title: "子程序对话",
          messages: [],
          updatedAt: Date.now(),
          actionDesigner: designerB,
          messageCount: 0,
        },
      ],
      openTabIds: [...base.openTabIds, "thread-b"],
      activeThreadId: "thread-b",
    },
    designerA,
  );
  assert.ok(withB.openTabIds.every((id) => id !== "thread-b"));
  assert.notEqual(withB.activeThreadId, "thread-b");
});

test("focusActionDesignerInStore tags legacy untagged active thread", () => {
  const legacy = defaultChatStore();
  const next = focusActionDesignerInStore(legacy, designerA);
  assert.equal(next.threads[0]!.actionDesigner?.entityId, designerA.entityId);
});
