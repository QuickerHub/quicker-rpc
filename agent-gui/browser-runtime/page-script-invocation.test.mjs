import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";
import { collectInteractiveNodes, findRefAtPoint, pickElementAtPoint } from "./snapshot.mjs";
import { collectSearchCandidates } from "./page-search.mjs";
import { collectPageOutline } from "./page-structure.mjs";
import { SessionManager } from "./session-manager.mjs";

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
  const heading = element("H1", "Fixture heading", { x: 10, y: 100, width: 200, height: 40 });
  body.children = [button, link, heading];
  for (const child of body.children) child.parentElement = body;
  button.children = [label]; label.parentElement = button;
  const elements = [body, button, label, link, heading];
  const document = {
    body,
    elementFromPoint: (x, y) => x === 25 && y === 30 ? label : null,
    querySelectorAll: (selector) => elements.filter((node) => selector === "a[href]"
      ? node === link : selector.split(",").includes(node.tagName.toLowerCase())),
    querySelector: (selector) => selector === 'meta[name="description"]'
      ? { getAttribute: () => "Fixture metadata" } : null,
  };
  const context = createContext({ document, window: { getComputedStyle: () => ({ visibility: "visible", display: "block" }) } });
  const locator = (rows) => ({
    first: () => locator(rows.slice(0, 1)), nth: (n) => locator(rows.slice(n, n + 1)),
    boundingBox: async () => rows[0]?.getBoundingClientRect() ?? null,
  });
  return {
    isClosed: () => false,
    url: () => "https://fixture.invalid/",
    title: async () => "Fixture title",
    getByRole: (role, options) => locator(elements.filter((node) => (
      role === "button" ? node === button : role === "link" && node === link
    ) && (!options?.name || node.innerText === options.name))),
    locator: (selector) => locator(selector === "aria-ref=inner" ? [label] : []),
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

test("search and outline execute their existing in-page collectors and preserve real structured results", async () => {
  const page = fixturePage();
  const candidates = await collectSearchCandidates(page);
  assert.equal(candidates.some((candidate) => candidate.role === "button" && candidate.text === "Save fixture"), true);
  assert.equal(candidates.some((candidate) => candidate.role === "link" && candidate.href === "https://fixture.invalid/link"), true);
  const outline = await collectPageOutline(page);
  assert.deepEqual(outline.headings, [{ level: 1, text: "Fixture heading" }]);
  assert.deepEqual(outline.links, [{ text: "Fixture link", href: "https://fixture.invalid/link" }]);
  assert.equal(outline.meta.description, "Fixture metadata");
});

test("ref picking uses the smallest matching locator box, including an aria ref, rather than page-script serialization", async () => {
  const page = fixturePage();
  const refs = { e1: { role: "button", name: "Save fixture", nth: 0 },
    e2: { role: "generic", name: "Save fixture", nth: 0, ariaRef: "inner" },
    e3: { role: "link", name: "Fixture link", nth: 0 } };
  assert.equal(await findRefAtPoint(page, refs, 25, 30), "e2");
  assert.equal(await findRefAtPoint(page, refs, 15, 22), "e1");
  assert.equal(await findRefAtPoint(page, refs, 700, 500), null);
});

test("SessionManager snapshot and pick consume executed DOM scripts, while its evaluated expression remains invoked", async () => {
  const page = fixturePage();
  const manager = new SessionManager({ headless: true, channel: null, userDataDir: "unused-generated-page-script-fixture" });
  manager._sessions.set("fixture", { sessionId: "fixture", page, refMap: {}, context: {
    close: () => assert.fail("No shared context close"), pages: () => [page],
  } });
  const snapshot = await manager.invoke("page.snapshot", { includePreview: false }, "fixture");
  assert.equal(snapshot.ok, true); assert.equal(snapshot.data.nodeCount, 2);
  assert.match(snapshot.data.snapshot, /role=button name="Save fixture" ref=e1/);
  const picked = await manager.invoke("page.pick_element", { x: 25, y: 30, includePreview: false }, "fixture");
  assert.equal(picked.ok, true); assert.equal(picked.data.ref, "e1"); assert.equal(picked.data.refRole, "button");
  const evaluated = await manager.invoke("page.evaluate", { script: "({ tag: document.body.children[0].tagName })" }, "fixture");
  assert.equal(evaluated.ok, true); assert.deepEqual(evaluated.data.value, { tag: "BUTTON" });
});
