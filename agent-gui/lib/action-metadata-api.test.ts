import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseActionMetadataFromGetJson } from "./action-metadata-api";

const GUID = "7d6999ed-93a1-4db0-9763-5405066199ac";

describe("action-metadata-api", () => {
  it("parseActionMetadataFromGetJson reads compressed metadata", () => {
    const meta = parseActionMetadataFromGetJson(GUID, {
      actionId: GUID,
      editVersion: 12,
      compressed: {
        title: "QuickerAgent",
        description: "RPC agent",
        icon: "fa:Light_Robot",
      },
    });
    assert.ok(meta);
    assert.equal(meta.id, GUID);
    assert.equal(meta.title, "QuickerAgent");
    assert.equal(meta.description, "RPC agent");
    assert.equal(meta.icon, "fa:Light_Robot");
    assert.equal(meta.editVersion, 12);
  });

  it("parseActionMetadataFromGetJson applies default icon", () => {
    const meta = parseActionMetadataFromGetJson(GUID, {
      compressed: { title: "Test" },
    });
    assert.ok(meta);
    assert.equal(meta.icon, "fa:Light_Bolt");
  });

  it("returns null for invalid id payload", () => {
    assert.equal(
      parseActionMetadataFromGetJson("not-a-guid", { compressed: { title: "x" } }),
      null,
    );
  });
});
