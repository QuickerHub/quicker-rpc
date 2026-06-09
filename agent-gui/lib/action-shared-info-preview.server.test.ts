import assert from "node:assert/strict";
import test from "node:test";

test("buildSharedActionPageUrl encodes shared id", async () => {
  const { buildSharedActionPageUrl } = await import("./action-shared-info-preview.server.ts");
  const url = buildSharedActionPageUrl("86c72b86-0169-4970-e9de-08dec5dab067");
  assert.equal(
    url,
    "https://getquicker.net/Sharedaction?code=86c72b86-0169-4970-e9de-08dec5dab067",
  );
});

test("stash and read preview html roundtrip", async () => {
  const {
    stashSharedInfoPreviewHtml,
    readSharedInfoPreviewHtml,
    wrapSharedInfoPreviewDocument,
  } = await import("./action-shared-info-preview.server.ts");

  const token = stashSharedInfoPreviewHtml("<p>hello</p>");
  const html = readSharedInfoPreviewHtml(token);
  assert.equal(html, "<p>hello</p>");

  const doc = wrapSharedInfoPreviewDocument(html!);
  assert.match(doc, /<p>hello<\/p>/);
  assert.match(doc, /草稿预览/);
});
