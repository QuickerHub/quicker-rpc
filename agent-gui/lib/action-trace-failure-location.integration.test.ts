import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildLocationFromQkrpcFailure,
  resolveTraceLocationInDataJson,
} from "./action-trace-data-json-location";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const traceFailFixturePath = join(
  repoRoot,
  "QuickerRpc.Plugin.Test",
  "Fixtures",
  "workspace-actions",
  "trace-fail-evalexpression",
  "data.json",
);

function loadTraceFailDataJson(): string {
  return readFileSync(traceFailFixturePath, "utf8");
}

test("integration: shared fixture data.json aligns with qkrpc failureLocation", () => {
  const dataJsonText = loadTraceFailDataJson();
  const dataJsonPath = ".quicker/actions/trace-fail-evalexpression/data.json";

  const fromQkrpc = buildLocationFromQkrpcFailure({
    qkrpcLocation: {
      stepPath: "1",
      stepId: "s-fail",
      stepRunnerKey: "sys:evalexpression",
      paramKey: "expression",
      dataJsonPointer: "steps[1].inputParams.expression",
      matchMethod: "stepId",
    },
    dataJsonText,
    dataJsonPath,
  });

  assert.ok(fromQkrpc);
  assert.equal(fromQkrpc!.nodePath, "1");
  assert.equal(fromQkrpc!.stepId, "s-fail");
  assert.ok((fromQkrpc!.startLine ?? 0) > 0);
  assert.match(fromQkrpc!.locationSummary, /path 1/);
  assert.match(fromQkrpc!.locationSummary, /param expression/);

  const fromEvents = resolveTraceLocationInDataJson({
    events: [
      { kind: "step_begin", stepId: "s-ok", stepRunnerKey: "sys:evalexpression" },
      { kind: "step_end", stepId: "s-ok" },
      {
        kind: "step_begin",
        stepId: "s-fail",
        stepRunnerKey: "sys:evalexpression",
        stepPath: "1",
      },
      { kind: "input", paramKey: "expression" },
      { kind: "error", stepPath: "1", message: "Input string was not in a correct format." },
    ],
    dataJsonText,
    dataJsonPath,
    runMeta: { ok: false },
  });

  assert.ok(fromEvents);
  assert.equal(fromEvents!.nodePath, "1");
  assert.equal(fromEvents!.dataJsonPointer, "steps[1].inputParams.expression");
});
