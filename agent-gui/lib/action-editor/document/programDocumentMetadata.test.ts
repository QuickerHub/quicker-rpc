import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprintProgramDocumentMetadataContent, patchProgramDocumentMetadata, readProgramDocumentMetadata, validateProgramDocumentMetadataForSave } from "./programDocumentMetadata";

test("appearance patch retains raw identities, opaque data, legacy casing and Int64 numeric lexemes", () => {
  const original = '{"ID":"bound-id","EditVersion":9223372036854775807,"Title":"  Before  ","Description":" line\\n ","Icon":"fa:old","Future":{"n":9007199254740993,"items":[true,null,{"title":"nested"}]},"ExportedUtc":"native"}\n';
  assert.deepEqual(readProgramDocumentMetadata(original), { title: "  Before  ", description: " line\n ", icon: "fa:old" });
  assert.equal(patchProgramDocumentMetadata(original, { title: "  Before  " }), original);
  const patched = patchProgramDocumentMetadata(original, { title: "  After  ", icon: "fa:new", description: "" });
  assert.equal(patched, original.replace('"  Before  "', '"  After  "').replace('"fa:old"', '"fa:new"').replace('" line\\n "', '""'));
  assert.equal(readProgramDocumentMetadata(patched).title, "  After  ");
  assert.match(patched, /"EditVersion":9223372036854775807/);
  assert.match(patched, /"n":9007199254740993/);
  assert.notEqual(fingerprintProgramDocumentMetadataContent(original), fingerprintProgramDocumentMetadataContent(original.replace("9007199254740993", "9007199254740992")));
});

test("metadata adds only missing presentation keys and keeps one existing casing", () => {
  const original = JSON.stringify({ Title: "Name", ID: "native", Future: { title: "nested" } });
  const patched = patchProgramDocumentMetadata(original, { description: "description", icon: "" });
  assert.deepEqual(JSON.parse(patched), { Title: "Name", ID: "native", Future: { title: "nested" }, Description: "description", Icon: "" });
  assert.deepEqual(JSON.parse(patchProgramDocumentMetadata("{}", { title: "New", description: "", icon: "" })), { title: "New", description: "", icon: "" });
  assert.deepEqual(JSON.parse(patchProgramDocumentMetadata('{"Title":"same","title":"same"}', { title: "updated" })), { Title: "updated", title: "updated" });
});

test("draft text may be empty, while save validates title without trimming display or reconstructing metadata", () => {
  const draft = patchProgramDocumentMetadata('{"title":"Name","description":"  raw  "}', { title: "  " });
  assert.equal(readProgramDocumentMetadata(draft).title, "  ");
  assert.throws(() => validateProgramDocumentMetadataForSave(draft), /title cannot be empty/);
  assert.doesNotThrow(() => validateProgramDocumentMetadataForSave(patchProgramDocumentMetadata(draft, { title: "  New  " })));
  assert.throws(() => patchProgramDocumentMetadata(draft, { id: "other" } as never), /not editable/);
  for (const invalid of ['[]', '{"title":1}', '{"title":"a","Title":"b"}', '{"title":"a","title":"b"}', '{"title":"a","future":{"x":1,"x":2}}']) {
    assert.throws(() => readProgramDocumentMetadata(invalid), undefined, invalid);
  }
});

test("metadata acknowledgement fingerprints ignore key order and whitespace, retaining every opaque field", () => {
  const original = '{"title":"A","future":{"b":[1,true,null,"escaped\\\""],"a":2}}';
  assert.equal(fingerprintProgramDocumentMetadataContent(original), fingerprintProgramDocumentMetadataContent(JSON.stringify(JSON.parse(original), null, 4)));
  assert.equal(fingerprintProgramDocumentMetadataContent(original), fingerprintProgramDocumentMetadataContent('{"future":{"a":2,"b":[1,true,null,"escaped\\\""]},"title":"A"}'));
  assert.notEqual(fingerprintProgramDocumentMetadataContent(original), fingerprintProgramDocumentMetadataContent(original.replace('"a":2', '"a":3')));
});
