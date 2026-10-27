import { test } from "node:test";
import { runRuntimeStartStopCase } from "./fixtures/runtime-start-stop-case";

test("six cold terminal GET/POST observers share one real owned Node runtime and stop it through IPC", { timeout: 15_000 },
  () => runRuntimeStartStopCase("terminal", "concurrent-ready"));
