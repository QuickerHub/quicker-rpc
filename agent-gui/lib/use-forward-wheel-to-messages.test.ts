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
    closest?: (selector: string) => MockNode | null;
  } = {},
): MockNode {
  const node = {
    className,
    parent: options.parent ?? null,
    parentElement: options.parent ?? null,
    scrollHeight: options.scrollHeight ?? 100,
    clientHeight: options.clientHeight ?? 100,
    overflowY: options.overflowY ?? "visible",
    closest(selector: string) {
      return options.closest?.(selector) ?? null;
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

test("ignores wheel on embedded browser remote surface", () => {
  const surface = mockNode("embedded-browser__remote-surface");
  const img = mockNode("embedded-browser__preview", {
    parent: surface,
    closest(selector: string) {
      if (selector === ".embedded-browser__remote-surface") return surface;
      return null;
    },
  });
  img.parentElement = surface;

  withMockComputedStyle(() => {
    assert.equal(shouldIgnoreWheelForwardToMessages(img), true);
  });
});

test("ignores wheel inside workspace side panel even when not scrollable", () => {
  const panel = mockNode("workspace-side-panel workspace-explorer", {
    scrollHeight: 400,
    clientHeight: 400,
    overflowY: "hidden",
    closest(selector: string) {
      if (selector === ".workspace-side-panel") return panel;
      return null;
    },
  });
  const hint = mockNode("workspace-explorer-hint", {
    parent: panel,
    closest(selector: string) {
      if (
        selector === ".workspace-side-panel"
        || selector === ".workspace-explorer"
      ) {
        return panel;
      }
      return null;
    },
  });
  hint.parentElement = panel;

  withMockComputedStyle(() => {
    assert.equal(shouldIgnoreWheelForwardToMessages(hint), true);
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
