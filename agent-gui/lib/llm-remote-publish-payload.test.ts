import assert from "node:assert/strict";
import test from "node:test";

const TEST_PEPPER = "test-remote-publish-pepper-v1";
process.env.LLM_REMOTE_PUBLISH_CIPHER_PEPPER = TEST_PEPPER;
import {
  unwrapRemotePublishConfigPayload,
  wrapRemotePublishConfigForUpload,
} from "@/lib/llm-remote-publish-payload";

const sampleConfig = {
  version: 2,
  groups: { gpt55: { label: "OpenAI", model: "gpt-5.5" } },
  endpoints: [
    {
      group: "gpt55",
      apiKey: "sk-test",
      baseURL: "https://example.com/v1",
      model: "gpt-5.5",
    },
  ],
};

test("wrapRemotePublishConfigForUpload round-trips through unwrap", () => {
  const wrapped = wrapRemotePublishConfigForUpload(sampleConfig);
  assert.equal(wrapped.version, 1);
  assert.ok(wrapped.enc.length > 0);
  assert.deepEqual(unwrapRemotePublishConfigPayload(wrapped), sampleConfig);
});

test("unwrapRemotePublishConfigPayload accepts legacy plain publish JSON", () => {
  assert.deepEqual(unwrapRemotePublishConfigPayload(sampleConfig), sampleConfig);
});
