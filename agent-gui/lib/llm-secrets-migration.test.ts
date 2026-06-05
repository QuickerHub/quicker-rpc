import assert from "node:assert/strict";
import test from "node:test";
import { parseRawLlmSecrets } from "@/lib/llm-local-secrets";
import { migrateLlmLocalSecrets } from "@/lib/llm-secrets-migration";

test("imports legacy providers.custom into a custom profile", () => {
  const { secrets, changed } = migrateLlmLocalSecrets({
    version: 1,
    providers: {
      custom: {
        apiKey: "sk-old-custom",
        baseURL: "https://api.example.com/v1",
        model: "gpt-4o-mini",
      },
    },
  });

  assert.equal(changed, true);
  assert.equal(secrets.version, 2);
  assert.equal(secrets.providers.custom, undefined);
  assert.equal(secrets.profiles?.length, 1);
  assert.equal(secrets.profiles?.[0]?.apiKey, "sk-old-custom");
  assert.equal(secrets.profiles?.[0]?.baseURL, "https://api.example.com/v1");
  assert.deepEqual(secrets.profiles?.[0]?.models, ["gpt-4o-mini"]);
});

test("rewrites activeSelection custom to imported profile", () => {
  const { secrets } = migrateLlmLocalSecrets({
    version: 1,
    providers: {
      custom: {
        apiKey: "sk-old-custom",
        baseURL: "https://api.example.com/v1",
        model: "gpt-4o-mini",
      },
    },
    activeSelection: "custom",
  });

  assert.match(secrets.activeSelection ?? "", /^profile:/);
  assert.ok(secrets.activeSelection?.includes("gpt-4o-mini"));
});

test("imports orphaned providers.custom when profiles already exist", () => {
  const { secrets, changed } = migrateLlmLocalSecrets({
    version: 2,
    providers: {
      custom: {
        apiKey: "sk-orphan",
        baseURL: "https://orphan.example.com/v1",
        model: "gpt-4o",
      },
    },
    profiles: [{
      id: "existing",
      title: "Existing",
      apiKey: "sk-existing",
      baseURL: "https://existing.example.com/v1",
      models: ["gpt-4o-mini"],
      defaultModel: "gpt-4o-mini",
    }],
  });

  assert.equal(changed, true);
  assert.equal(secrets.providers.custom, undefined);
  assert.equal(secrets.profiles?.length, 2);
  assert.ok(secrets.profiles?.some((profile) => profile.apiKey === "sk-orphan"));
});

test("migrates legacy directApiKey into bingleimuzi provider override", () => {
  const { secrets, changed } = migrateLlmLocalSecrets({
    version: 1,
    providers: {},
    directApiKey: "sk-direct",
  });

  assert.equal(changed, true);
  assert.equal(secrets.directApiKey, undefined);
  assert.equal(secrets.providers.bingleimuzi?.apiKey, "sk-direct");
});

test("maps legacy providers.default to bingleimuzi before migration", () => {
  const parsed = parseRawLlmSecrets({
    version: 1,
    providers: {
      default: { apiKey: "sk-default" },
    },
  });
  assert.equal(parsed.providers.bingleimuzi?.apiKey, "sk-default");
});
