import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";
import { collectInteractiveNodes, pickElementAtPoint } from "./snapshot.mjs";

function fixturePage() {
  const element = (tagName, text, rect, attributes = {}) => ({
    tagName, nodeType: 1, children: [], childNodes: [{ nodeType: 3, textContent: text }],
    innerText: text, textContent: text, parentElement: null,
    getAttribute: (name) => attributes[name] ?? null,
    getBoundingClientRect: () => rect,
  });
  const body = element("BODY", "", { x: 0, y: 0, width: 800, height: 600 });
  const button = element("BUTTON", "Save fixture", { x: 10, y: 20, width: 120, height: 40 });
  const label = element("SPAN", "Save fixture", { x: 20, y: 25, width: 40, height: 20 });
  const link = element("A", "Fixture link", { x: 200, y: 20, width: 120, height: 40 });
  link.href = "https://fixture.invalid/link";
  body.children = [button, link]; button.parentElement = body; link.parentElement = body;
  button.children = [label]; label.parentElement = button;
  const document = { body, elementFromPoint: (x, y) => x === 25 && y === 30 ? label : null };
  const context = createContext({ document, window: { getComputedStyle: () => ({ visibility: "visible", display: "block" }) } });
  return {
    async evaluate(expression, arg) {
      // Like Playwright, string expressions are evaluated as-is; only actual functions receive arg.
      const value = typeof expression === "string"
        ? runInContext(expression, context)
        : runInContext(`(${expression.toString()})`, context)(arg);
      const result = await value;
      return typeof result === "function" ? undefined : structuredClone(result);
    },
  };
}

test("snapshot executes its repository collector instead of returning an unserializable function value", async () => {
  const nodes = await collectInteractiveNodes(fixturePage());
  assert.deepEqual(nodes, [
    { role: "button", name: "Save fixture" },
    { role: "link", name: "Fixture link", href: "https://fixture.invalid/link" },
  ]);
});

test("picking invokes its page function with the requested coordinates and walks to a meaningful ancestor", async () => {
  const page = fixturePage();
  const picked = await pickElementAtPoint(page, 25, 30);
  assert.equal(picked.found, true); assert.equal(picked.role, "button"); assert.equal(picked.name, "Save fixture");
  assert.deepEqual({ x: picked.x, y: picked.y, width: picked.width, height: picked.height }, { x: 10, y: 20, width: 120, height: 40 });
  assert.deepEqual(await pickElementAtPoint(page, 700, 500), { found: false });
});
