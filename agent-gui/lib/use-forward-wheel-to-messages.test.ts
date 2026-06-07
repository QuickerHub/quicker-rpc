import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldIgnoreWheelForwardToMessages } from "./use-forward-wheel-to-messages";

type MockNode = Element & {
  className: string;
  parent: MockNode | null;
  parentElement: MockNode | null;
  scrollHeight: number;
  clientHeight: number;
  overflowY: string;
  closest: (selector: string) => MockNode | null;
};

function mockNode(
  className: string,
  options: {
    parent?: MockNode | null;
    scrollHeight?: number;
    clientHeight?: number;
    overflowY?: string;
  } = {},
): MockNode {
  const node = {
    className,
    parent: options.parent ?? null,
    parentElement: options.parent ?? null,
    scrollHeight: options.scrollHeight ?? 100,
    clientHeight: options.clientHeight ?? 100,
    overflowY: options.overflowY ?? "visible",
    closest(_selector: string) {
      return null;
    },
  } as MockNode;
  return node;
}

function withMockComputedStyle(run: () => void): void {
  const originalGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = ((el: Element) => {
    const mock = el as MockNode;
    return { overflowY: mock.overflowY } as CSSStyleDeclaration;
  }) as typeof getComputedStyle;
  try {
    run();
  } finally {
    globalThis.getComputedStyle = originalGetComputedStyle;
  }
}

test("ignores wheel inside a vertically scrollable popup list", () => {
  const panel = mockNode("composer-popup action-picker-panel");
  const body = mockNode("action-picker-body", {
    parent: panel,
    scrollHeight: 800,
    clientHeight: 200,
    overflowY: "auto",
  });
  const button = mockNode("action-picker-item", { parent: body });
  body.parentElement = panel;
  button.parentElement = body;

  withMockComputedStyle(() => {
    assert.equal(shouldIgnoreWheelForwardToMessages(button), true);
  });
});

test("forwards wheel from non-scrollable composer chrome", () => {
  const trigger = mockNode("tool-selector-trigger", {
    scrollHeight: 32,
    clientHeight: 32,
    overflowY: "visible",
  });
  trigger.parentElement = null;

  withMockComputedStyle(() => {
    assert.equal(shouldIgnoreWheelForwardToMessages(trigger), false);
  });
});
