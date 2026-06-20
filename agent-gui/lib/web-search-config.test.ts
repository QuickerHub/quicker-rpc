import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  invalidateWebSearchConfigCache,
  readWebSearchEnv,
} from "@/lib/web-search-config";
import { resolveWebSearchProvider } from "@/lib/web-search.shared";

describe("web-search-config", () => {
  it("process env overrides config file values", () => {
    const prevProvider = process.env.WEB_SEARCH_PROVIDER;
    const prevTavily = process.env.TAVILY_API_KEY;
    process.env.WEB_SEARCH_PROVIDER = "brave";
    process.env.TAVILY_API_KEY = "env-tavily";
    invalidateWebSearchConfigCache();
    try {
      const env = readWebSearchEnv();
      assert.equal(env.WEB_SEARCH_PROVIDER, "brave");
      assert.equal(env.TAVILY_API_KEY, "env-tavily");
      assert.equal(resolveWebSearchProvider(env), "brave");
    } finally {
      if (prevProvider === undefined) delete process.env.WEB_SEARCH_PROVIDER;
      else process.env.WEB_SEARCH_PROVIDER = prevProvider;
      if (prevTavily === undefined) delete process.env.TAVILY_API_KEY;
      else process.env.TAVILY_API_KEY = prevTavily;
      invalidateWebSearchConfigCache();
    }
  });
});
