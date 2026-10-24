import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "../catalog/designerCatalogPort";
import type { DesignerCatalogContext } from "../catalog/designerCatalogContext";
import { fetchDesignerFaPage } from "../catalog/designerFaPage";
import { buildFaIconSpec, FA_ICON_PAGE_SIZE, FA_REGULAR_BRANDS_STYLE, isUrlLikeIconSpec, parseFaIconSpec, searchPickerFaIcons, toPickerStyleFilter } from "./faIconPickerSearch";

const scope = (letter: string): DesignerCatalogContext => ({ cwd: "C:/fixture", projectDirectory: `.quicker/actions/${letter}`,
  expectedProjectBinding: { schemaVersion: 1, kind: "action", actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", hostBinding: {
    hostInstanceId: letter, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", capabilities: {},
  } } });
type Query = { query: string; style: string | null; skip: number; take: number };
const regular = ["Regular_A", "Regular_B", "Regular_C"], brands = ["Brands_A", "Brands_B", "Brands_C", "Brands_D"];
function page(query: Query, names: readonly string[]) {
  const selected = names.slice(query.skip, query.skip + query.take);
  return { ok: true, ...query, names: selected, totalCount: names.length, hasMore: query.skip + selected.length < names.length };
}
function fixture(letter = "a", fetcher?: (query: Query) => Promise<Response>) {
  const calls: Query[] = [];
  const port = createDesignerCatalogPort(scope(letter), async (_path, init) => {
    const { catalogContext, ...query } = JSON.parse(String(init?.body));
    assert.deepEqual(catalogContext, scope(letter)); calls.push(query);
    return fetcher ? fetcher(query) : Response.json(page(query, query.style === "Regular" ? regular : query.style === "Brands" ? brands : [`Light_${letter}`]));
  });
  return { port, calls };
}

test("FA spec helpers preserve source aliases, color tokens and non-FA URL/resource specs", () => {
  assert.equal(FA_ICON_PAGE_SIZE, 96);
  for (const spec of ["https://host/a:b.png", "//host/icon", "url:abc", "res:icon", "LOCAL-ICON:a", "data:image/png;base64,abc"])
    { assert.equal(isUrlLikeIconSpec(spec), true); assert.deepEqual(parseFaIconSpec(spec), { name: "", style: "Light", color: "" }); }
  for (const spec of ["qk:abc", "sc:abc", "iconify:mdi:star", "icon:foo"]) assert.equal(parseFaIconSpec(spec).name, "");
  assert.deepEqual(parseFaIconSpec(" FA:regular_Star : #112233 "), { name: "regular_Star", style: "Regular", color: "#112233" });
  assert.deepEqual(parseFaIconSpec("fa:Brand_Github:Accent"), { name: "Brand_Github", style: "Brands", color: "Accent" });
  assert.deepEqual(parseFaIconSpec("Future_New:Blue"), { name: "Future_New", style: "Future", color: "Blue" });
  assert.deepEqual(parseFaIconSpec("fa:Light_Star:https://host/color"), { name: "Light_Star:https://host/color", style: "Light", color: "" });
  assert.equal(buildFaIconSpec(" Light_Star ", " Accent "), "fa:Light_Star:Accent"); assert.equal(buildFaIconSpec(" ", "Red"), "");
  assert.equal(toPickerStyleFilter("Regular"), FA_REGULAR_BRANDS_STYLE); assert.equal(toPickerStyleFilter("Brands"), FA_REGULAR_BRANDS_STYLE);
  assert.equal(toPickerStyleFilter(" Solid "), "Solid"); assert.equal(toPickerStyleFilter("Future"), "Light");
});

test("virtual pages cross the Regular/Brands seam and retain both totals at all boundaries", async () => {
  for (const [skip, take] of [[0, 3], [2, 3], [3, 3], [6, 3], [7, 3], [20, 3]]) {
    const { port, calls } = fixture();
    try {
      const result = await searchPickerFaIcons(port, { query: "  icon  ", style: FA_REGULAR_BRANDS_STYLE, skip, take });
      assert.deepEqual(result, { query: "icon", style: FA_REGULAR_BRANDS_STYLE, skip, take,
        names: [...regular, ...brands].slice(skip, skip + take), totalCount: 7, hasMore: skip + result.names.length < 7 });
      assert.ok(Object.isFrozen(result) && Object.isFrozen(result.names));
      assert.equal(calls.length, 2); assert.deepEqual(calls[0], { query: "icon", style: "Regular", skip, take });
      assert.equal(calls[1].style, "Brands");
      assert.equal(calls[1].take, skip === 0 ? 1 : Math.min(take, skip >= 3 ? take : 2));
    } finally { port.dispose(); }
  }
});

test("plain pages reuse bounded native normalization and reject invalid windows without requests", async () => {
  const { port, calls } = fixture();
  try {
    const result = await searchPickerFaIcons(port, { query: " a ", style: "", skip: -2, take: 1000 });
    assert.deepEqual(calls, [{ query: "a", style: null, skip: 0, take: 300 }]); assert.equal(result.style, null);
    for (const skip of [NaN, Infinity, 0.5, 2147483648])
      await assert.rejects(searchPickerFaIcons(port, { style: FA_REGULAR_BRANDS_STYLE, skip }), { code: "INVALID_FA_PAGE_REQUEST" });
    assert.equal(calls.length, 1);
  } finally { port.dispose(); }
  for (const context of [undefined, null, { ...scope("a"), expectedProjectBinding: null }]) {
    let calls = 0; const unavailable = createDesignerCatalogPort(context, async () => { calls++; throw new Error("No request permitted"); });
    await assert.rejects(searchPickerFaIcons(unavailable, { style: FA_REGULAR_BRANDS_STYLE }), { code: "HOST_BINDING_REQUIRED" });
    assert.equal(calls, 0); unavailable.dispose();
  }
});

test("an empty Regular or Brands segment still contributes its real total without inventing rows", async () => {
  for (const [left, right] of [[[], brands], [regular, []], [[], []]] as const) {
    const { port, calls } = fixture("a", async (query) => Response.json(page(query, query.style === "Regular" ? left : right)));
    try {
      const result = await searchPickerFaIcons(port, { style: FA_REGULAR_BRANDS_STYLE, skip: 1, take: 3 });
      assert.deepEqual(result.names, [...left, ...right].slice(1, 4));
      assert.equal(result.totalCount, left.length + right.length);
      assert.equal(result.hasMore, 1 + result.names.length < result.totalCount); assert.equal(calls.length, 2);
    } finally { port.dispose(); }
  }
});

test("two document hosts retain independent pages and propagate native failure without softening", async () => {
  const first = fixture("a"), second = fixture("b");
  try {
    assert.deepEqual((await searchPickerFaIcons(first.port, { style: "Light" })).names, ["Light_a"]);
    assert.deepEqual((await searchPickerFaIcons(second.port, { style: "Light" })).names, ["Light_b"]);
    await searchPickerFaIcons(first.port, { style: "Light" }); assert.equal(first.calls.length, 1); assert.equal(second.calls.length, 1);
  } finally { first.port.dispose(); second.port.dispose(); }
  const failed = fixture("a", async (query) => query.style === "Regular" ? Response.json(page(query, regular))
    : Response.json({ ok: false, code: "UNSUPPORTED_HOST", error: "Brands unavailable" }, { status: 503 }));
  try { await assert.rejects(searchPickerFaIcons(failed.port, { style: FA_REGULAR_BRANDS_STYLE }), { code: "UNSUPPORTED_HOST", message: "Brands unavailable" }); }
  finally { failed.port.dispose(); }
});

test("preabort and cancellation after either cached native page preserve reason and publish no virtual result", async () => {
  const pre = new AbortController(), reason = new Error("picker closed"); pre.abort(reason);
  await assert.rejects(searchPickerFaIcons(undefined, { style: "Light" }, pre.signal), (error) => error === reason);
  for (const abortStyle of ["Regular", "Brands"]) {
    const { port, calls } = fixture();
    await fetchDesignerFaPage(port, { style: "Regular", skip: 2, take: 3 });
    await fetchDesignerFaPage(port, { style: "Brands", skip: 0, take: 2 });
    const abort = new AbortController(), cancellation = new Error(`cancel after ${abortStyle}`), originalGet = port.get;
    port.get = <T>(key: string): T | undefined => { const value = originalGet<T>(key); if (key.includes(`\"style\":\"${abortStyle}\"`)) queueMicrotask(() => abort.abort(cancellation)); return value; };
    try {
      await assert.rejects(searchPickerFaIcons(port, { style: FA_REGULAR_BRANDS_STYLE, skip: 2, take: 3 }, abort.signal), (error) => error === cancellation);
      assert.equal(calls.length, 2, "native cache reads must not make additional requests");
    } finally { port.dispose(); }
  }
});
