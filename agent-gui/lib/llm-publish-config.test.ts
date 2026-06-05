import assert from "node:assert/strict";
import test from "node:test";
import { mergeDevAndPublishEndpoints } from "@/lib/llm-publish-config";

test("mergeDevAndPublishEndpoints prefers dev before publish", () => {
  const dev = [
    {
      apiKey: "sk-dev",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
    },
  ];
  const publish = [
    {
      apiKey: "sk-publish",
      baseURL: "https://api.bingleimuzi.eu.cc/v1",
      model: "deepseek-v4-pro",
    },
    {
      apiKey: "sk-dev",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
    },
  ];
  const merged = mergeDevAndPublishEndpoints(dev, publish);
  assert.deepEqual(merged, [dev[0], publish[0]]);
});
