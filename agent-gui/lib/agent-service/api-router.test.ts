import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentApiRouter } from "./api-router";
import { RELEASE_PREVIEW_COOKIE } from "../release-preview-constants";
import { isReleasePreviewActive } from "../release-preview-context";

test("API groups preserve dynamic params, methods and concurrent Cookie scopes", async () => {
  let loads = 0;
  const route = createAgentApiRouter([{ path: "/api/history/[id]", methods: ["GET"], load: async () => {
    loads++;
    return { GET: async (_req: Request, context: { params: Promise<{ id: string }> }) => {
      const { id } = await context.params;
      await Promise.resolve();
      return Response.json({ id, preview: isReleasePreviewActive() });
    } };
  } }]);
  const a = new Request("http://agent.test/api/history/a%20b", { headers: { cookie: `${RELEASE_PREVIEW_COOKIE}=1` } });
  const b = new Request("http://agent.test/api/history/c");
  const responses = await Promise.all([route(a), route(b)]);
  assert.deepEqual(await responses[0].json(), { id: "a b", preview: true });
  assert.deepEqual(await responses[1].json(), { id: "c", preview: false });
  const denied = await route(new Request(a, { method: "DELETE" }));
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get("allow"), "GET");
  assert.equal((await route(new Request("http://agent.test/api/missing"))).status, 404);
  assert.equal((await route(new Request("http://agent.test/api/history/%ZZ"))).status, 400);
  assert.equal(loads, 2);
});
