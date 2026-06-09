import assert from "node:assert/strict";
import test from "node:test";
import { isDevInteractionFaultMessage } from "./DevErrorCapture";

test("does not treat ordinary React render loops as dead interaction faults", () => {
  assert.equal(
    isDevInteractionFaultMessage(
      "Maximum update depth exceeded. This can happen when a component repeatedly calls setState.",
    ),
    false,
  );
});

test("does not treat dependency array size warnings as dead interaction faults", () => {
  assert.equal(
    isDevInteractionFaultMessage(
      "The final argument passed to useEffect changed size between renders.",
    ),
    false,
  );
});

test("still treats hook order crashes as dead interaction faults", () => {
  assert.equal(
    isDevInteractionFaultMessage(
      "React has detected a change in the order of Hooks called by ToolTestPage.",
    ),
    true,
  );
});
