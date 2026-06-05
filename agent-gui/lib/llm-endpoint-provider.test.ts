import assert from "node:assert/strict";
import test from "node:test";
import { filterEndpointsForProvider } from "@/lib/llm-endpoint-provider";
import {
  DEEPSEEK_PROVIDER_ID,
  LLM_PROVIDER_ID,
} from "@/lib/llm-providers";

test("filterEndpointsForProvider splits gpt and deepseek publish endpoints", () => {
  const endpoints = [
    {
      apiKey: "sk-gpt",
      baseURL: "https://api.example/v1",
      model: "gpt-5.5",
    },
    {
      apiKey: "sk-ds",
      baseURL: "https://api.example/v1",
      model: "deepseek-v4-pro",
    },
  ];

  assert.deepEqual(filterEndpointsForProvider(endpoints, LLM_PROVIDER_ID), [
    endpoints[0],
  ]);
  assert.deepEqual(filterEndpointsForProvider(endpoints, DEEPSEEK_PROVIDER_ID), [
    endpoints[1],
  ]);
});
