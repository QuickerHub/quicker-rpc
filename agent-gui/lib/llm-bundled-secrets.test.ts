import assert from "node:assert/strict";
import test from "node:test";
import { dedupeEndpointConfigs } from "@/lib/llm-config";
import { mergeBundledWithPublishEndpoints } from "@/lib/llm-bundled-secrets";

test("dedupeEndpointConfigs removes duplicate apiKey + baseURL pairs", () => {
  const endpoints = [
    { apiKey: "sk-a", baseURL: "https://one/v1", model: "gpt-5.5" },
    { apiKey: "sk-a", baseURL: "https://one/v1/", model: "gpt-5.5" },
    { apiKey: "sk-b", baseURL: "https://two/v1", model: "gpt-5.5" },
  ];
  assert.equal(dedupeEndpointConfigs(endpoints).length, 2);
});

test("mergeBundledWithPublishEndpoints keeps bundled first then publish", () => {
  const bundled = [
    { apiKey: "sk-bundled", baseURL: "https://bundled/v1", model: "gpt-5.5" },
  ];
  const publish = [
    { apiKey: "sk-publish", baseURL: "https://publish/v1", model: "gpt-5.5" },
    { apiKey: "sk-bundled", baseURL: "https://bundled/v1", model: "gpt-5.5" },
  ];
  const merged = mergeBundledWithPublishEndpoints(bundled, publish);
  assert.deepEqual(merged, [
    bundled[0],
    publish[0],
  ]);
});
