import { test } from "node:test";
import { runRuntimeStartStopCase } from "./fixtures/runtime-start-stop-case";

test("stop drains an unread rejected health body", { timeout: 15_000 }, () => runRuntimeStartStopCase("browser", "rejected-health"));
