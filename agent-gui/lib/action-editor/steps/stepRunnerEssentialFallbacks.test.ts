import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAgentSchemaToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import catalog from "@/lib/action-editor/data/step-runners-ui-catalog.json";
import { resolveLocalStepRunnerDetailItem } from "./stepRunnerEssentialFallbacks";

test("static UI catalog includes sys:assign with editable params", () => {
  const raw = catalog.schemas["sys:assign"];
  assert.ok(raw, "sys:assign must be in step-runners-ui-catalog.json");
  const item = mapAgentSchemaToStepRunnerItem(raw as Record<string, unknown>);
  assert.equal(item.key, "sys:assign");
  assert.ok((item.inputParamDefs?.length ?? 0) > 0);
  assert.ok(item.inputParamDefs?.some((d) => d.key === "input"));
  assert.ok(item.outputParamDefs?.some((d) => d.key === "output"));
});

test("resolveLocalStepRunnerDetailItem prefers stripped catalog row over essential fallback", () => {
  const fromCatalog = mapAgentSchemaToStepRunnerItem(
    catalog.schemas["sys:assign"] as Record<string, unknown>,
  );
  const item = resolveLocalStepRunnerDetailItem("sys:assign", {
    catalogItem: {
      key: "sys:assign",
      name: "赋值",
      inputParamDefs: [],
      outputParamDefs: [],
    },
    cachedDetail: fromCatalog,
  });
  assert.equal(item?.inputParamDefs?.some((d) => d.key === "input"), true);
});
