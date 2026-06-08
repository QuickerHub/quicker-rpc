import assert from "node:assert/strict";
import test from "node:test";
import {
  inferProviderFromGroupId,
  mergeLlmEndpointGroupsConfigs,
  overlayLlmEndpointGroupsConfigs,
  parseLlmEndpointGroupsConfig,
  pruneOrphanLlmGroupDefs,
  resolveGroupModel,
} from "@/lib/llm-endpoint-groups";
import { mergeDevAndPublishEndpoints } from "@/lib/llm-publish-config";
import { DEEPSEEK_PROVIDER_ID, LLM_PROVIDER_ID } from "@/lib/llm-providers";

test("inferProviderFromGroupId maps known group ids", () => {
  assert.equal(inferProviderFromGroupId("deepseek"), DEEPSEEK_PROVIDER_ID);
  assert.equal(inferProviderFromGroupId("gpt55"), LLM_PROVIDER_ID);
  assert.equal(inferProviderFromGroupId("bingleimuzi"), LLM_PROVIDER_ID);
  assert.equal(inferProviderFromGroupId("custom"), undefined);
});

test("parseLlmEndpointGroupsConfig assigns legacy endpoints to provider groups", () => {
  const config = parseLlmEndpointGroupsConfig({
    version: 1,
    sponsors: {
      deepseek: {
        name: "Sponsor",
        url: "https://example.com/u",
      },
    },
    endpoints: [
      {
        apiKey: "sk-a",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-v4-flash",
      },
    ],
  });

  assert.equal(config.endpointsByGroup.get("deepseek")?.length, 1);
  assert.equal(config.groups.get("deepseek")?.sponsor?.name, "Sponsor");
});

test("parseLlmEndpointGroupsConfig accepts groups without provider field", () => {
  const config = parseLlmEndpointGroupsConfig({
    version: 2,
    groups: {
      deepseek: {
        label: "DeepSeek",
        model: "deepseek-v4-pro",
      },
    },
    endpoints: [
      {
        group: "deepseek",
        apiKey: "sk-a",
        baseURL: "https://proxy/v1",
        model: "deepseek-v4-pro",
      },
    ],
  });

  const [group] = Array.from(config.endpointsByGroup.keys());
  assert.equal(group, "deepseek");
});

test("mergeLlmEndpointGroupsConfigs keeps first layer endpoints ahead in fallback", () => {
  const dev = parseLlmEndpointGroupsConfig({
    version: 2,
    groups: {
      deepseek: {
        label: "DeepSeek",
        model: "deepseek-v4-flash",
      },
    },
    endpoints: [
      {
        group: "deepseek",
        apiKey: "sk-dev",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-v4-flash",
      },
    ],
  });
  const publish = parseLlmEndpointGroupsConfig({
    version: 2,
    groups: {
      deepseek: {
        label: "DeepSeek",
        model: "deepseek-v4-pro",
      },
    },
    endpoints: [
      {
        group: "deepseek",
        apiKey: "sk-publish",
        baseURL: "https://proxy/v1",
        model: "deepseek-v4-pro",
      },
    ],
  });

  const merged = mergeLlmEndpointGroupsConfigs(dev, publish);
  const chain = merged.endpointsByGroup.get("deepseek") ?? [];
  assert.equal(chain[0]?.apiKey, "sk-dev");
  assert.equal(chain[1]?.apiKey, "sk-publish");
  assert.equal(
    resolveGroupModel("deepseek", merged.groups.get("deepseek")!, chain),
    "deepseek-v4-pro",
  );
});

test("overlayLlmEndpointGroupsConfigs prefers overlay endpoints and defs", () => {
  const dev = parseLlmEndpointGroupsConfig({
    version: 2,
    groups: {
      deepseek: {
        label: "DeepSeek",
        model: "deepseek-v4-flash",
      },
    },
    endpoints: [
      {
        group: "deepseek",
        apiKey: "sk-dev",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-v4-flash",
      },
    ],
  });
  const publish = parseLlmEndpointGroupsConfig({
    version: 2,
    groups: {
      deepseek: {
        label: "DeepSeek",
        model: "deepseek-v4-pro",
      },
    },
    endpoints: [
      {
        group: "deepseek",
        apiKey: "sk-publish",
        baseURL: "https://proxy/v1",
        model: "deepseek-v4-pro",
      },
    ],
  });

  const merged = overlayLlmEndpointGroupsConfigs(publish, dev);
  const chain = merged.endpointsByGroup.get("deepseek") ?? [];
  assert.equal(chain[0]?.apiKey, "sk-dev");
  assert.equal(
    resolveGroupModel("deepseek", merged.groups.get("deepseek")!, chain),
    "deepseek-v4-flash",
  );
});

test("mergeDevAndPublishEndpoints prefers dev before publish", () => {
  const dev = [
    {
      apiKey: "sk-dev",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      group: "deepseek",
    },
  ];
  const publish = [
    {
      apiKey: "sk-publish",
      baseURL: "https://api.bingleimuzi.eu.cc/v1",
      model: "deepseek-v4-pro",
      group: "deepseek",
    },
    {
      apiKey: "sk-dev",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      group: "deepseek",
    },
  ];
  const merged = mergeDevAndPublishEndpoints(dev, publish);
  assert.deepEqual(merged, [dev[0], publish[0]]);
});

test("pruneOrphanLlmGroupDefs drops groups without endpoints", () => {
  const config = parseLlmEndpointGroupsConfig({
    version: 2,
    groups: {
      gpt55: { label: "OpenAI", model: "gpt-5.5" },
      deepseek: { label: "DeepSeek", model: "deepseek-v4-pro" },
    },
    endpoints: [
      {
        group: "gpt55",
        apiKey: "sk-a",
        baseURL: "https://proxy/v1",
        model: "gpt-5.5",
      },
    ],
  });

  const pruned = pruneOrphanLlmGroupDefs(config);
  assert.equal(pruned.groups.has("gpt55"), true);
  assert.equal(pruned.groups.has("deepseek"), false);
  assert.equal(pruned.endpointsByGroup.get("gpt55")?.length, 1);
});
