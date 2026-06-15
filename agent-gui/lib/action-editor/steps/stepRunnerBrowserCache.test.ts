import assert from "node:assert/strict";
import test from "node:test";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import {
  mergeStepRunnerBrowserCache,
  readStepRunnerBrowserCache,
  stepRunnerBrowserCacheStorageKey,
  stepRunnerSchemaMatchesCache,
  stripStepRunnerItemForCatalogCache,
} from "./stepRunnerBrowserCache";
import { STEPRUNNER_CATALOG_CACHE_VERSION } from "./stepRunnerCatalogVersion";

const storage = new Map<string, string>();

function installLocalStorageShim(): void {
  (globalThis as { window?: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    },
  };
}

test("stripStepRunnerItemForCatalogCache removes param defs", () => {
  const item: StepRunnerItem = {
    key: "sys:delay",
    name: "延时",
    icon: "fa:Clock",
    inputParamDefs: [{ key: "ms", name: "毫秒", varType: 1 }],
    outputParamDefs: [{ key: "ok", name: "成功", varType: 2 }],
  };
  const stripped = stripStepRunnerItemForCatalogCache(item);
  assert.equal(stripped.key, "sys:delay");
  assert.equal(stripped.inputParamDefs?.length, 0);
  assert.equal(stripped.outputParamDefs?.length, 0);
});

test("merge and read browser cache round-trip", () => {
  installLocalStorageShim();
  storage.clear();
  const baseUrl = "http://127.0.0.1:9477";

  mergeStepRunnerBrowserCache(baseUrl, {
    lookup: {
      "sys:delay": {
        key: "sys:delay",
        name: "延时",
        description: "",
        icon: "fa:Clock",
        stepType: "Action",
      },
    },
    catalogItems: [
      {
        key: "sys:delay",
        name: "延时",
        icon: "fa:Clock",
        stepType: "Action",
      },
    ],
    schemaByCacheKey: {
      "sys:delay": {
        key: "sys:delay",
        inputParamDefs: [{ key: "ms", name: "毫秒", varType: 1 }],
      },
    },
    qkrpcEpoch: "0.12.3",
  });

  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try {
        const key = stepRunnerBrowserCacheStorageKey(baseUrl);
        assert.ok(storage.has(key));
        const snapshot = readStepRunnerBrowserCache(baseUrl);
        assert.ok(snapshot);
        assert.equal(snapshot?.catalogCacheVersion, STEPRUNNER_CATALOG_CACHE_VERSION);
        assert.equal(snapshot?.entries["sys:delay"]?.name, "延时");
        assert.equal(snapshot?.schemas["sys:delay"]?.item.inputParamDefs?.length, 1);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 700);
  });
});

test("stepRunnerSchemaMatchesCache compares schema fingerprints", () => {
  const schemaA: StepRunnerItem = {
    key: "sys:clipboard",
    inputParamDefs: [{ key: "op", name: "操作", varType: 3 }],
  };
  const schemaB: StepRunnerItem = {
    key: "sys:clipboard",
    inputParamDefs: [
      { key: "op", name: "操作", varType: 3 },
      { key: "fmt", name: "格式", varType: 0 },
    ],
  };
  const cached = { "sys:clipboard": schemaA };
  assert.equal(stepRunnerSchemaMatchesCache("sys:clipboard", schemaA, cached), true);
  assert.equal(stepRunnerSchemaMatchesCache("sys:clipboard", schemaB, cached), false);
});
