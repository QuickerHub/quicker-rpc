import { test } from "node:test";
import { runRuntimeStartStopCase } from "./fixtures/runtime-start-stop-case";

for (const kind of ["browser", "terminal"] as const) {
  for (const phase of ["initial-health", "spawned-poll"] as const) {
    test(`stop cancels ${kind} startup during ${phase} and drains only its owned Node fixture`, { timeout: 15_000 }, () => runRuntimeStartStopCase(kind, phase));
  }
}
