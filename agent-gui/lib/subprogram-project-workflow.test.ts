import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSubProgramProjectInfo,
  subprogramProjectInfoFromCreateResponse,
  subprogramProjectInfoFromMetadataGet,
} from "@/lib/subprogram-project-workflow";

const subProgramId = "48c04d40-6774-4ca9-8821-3bc267aa2705";

test("subprogramProjectInfoFromMetadataGet reads title from compressed", () => {
  const info = subprogramProjectInfoFromMetadataGet(
    subProgramId,
    {
      subProgramId,
      name: "",
      callIdentifier: `%%${subProgramId}`,
      editVersion: 2,
      compressed: {
        title: "aaabbbb",
        description: "demo",
        icon: "fa:Light_Code",
      },
    },
    { description: "hint-desc", icon: "fa:Light_Hint" },
  );
  assert.equal(info.id, subProgramId);
  assert.equal(info.name, "aaabbbb");
  assert.equal(info.callIdentifier, `%%${subProgramId}`);
  assert.equal(info.editVersion, 2);
  assert.equal(info.description, "demo");
  assert.equal(info.icon, "fa:Light_Code");
});

test("subprogramProjectInfoFromCreateResponse reads create payload", () => {
  const info = subprogramProjectInfoFromCreateResponse(
    {
      subProgramId,
      name: "aaabbbb",
      callIdentifier: `%%${subProgramId}`,
      editVersion: 2,
    },
    { description: "demo", icon: "fa:Light_Code" },
  );
  assert.ok(info);
  assert.equal(info!.name, "aaabbbb");
});

test("subprogramProjectInfoFromCreateResponse returns null without id", () => {
  assert.equal(subprogramProjectInfoFromCreateResponse({ name: "x" }), null);
});

test("formatSubProgramProjectInfo uses PascalCase keys", () => {
  const text = formatSubProgramProjectInfo({
    id: subProgramId,
    name: "aaabbbb",
    callIdentifier: `%%${subProgramId}`,
    editVersion: 1,
    exportedUtc: "2026-06-04T00:00:00.000Z",
  });
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.equal(parsed.Id, subProgramId);
  assert.equal(parsed.Name, "aaabbbb");
  assert.equal(parsed.CallIdentifier, `%%${subProgramId}`);
  assert.equal(parsed.EditVersion, 1);
});
