import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveNextForkThreadTitle,
  stripForkTitlePrefix,
} from "@/lib/thread-fork-title";

test("stripForkTitlePrefix removes nested fork prefixes", () => {
  assert.equal(stripForkTitlePrefix("My task"), "My task");
  assert.equal(stripForkTitlePrefix("(1) My task"), "My task");
  assert.equal(stripForkTitlePrefix("(2) (1) My task"), "My task");
});

test("deriveNextForkThreadTitle increments fork index for shared base title", () => {
  assert.equal(
    deriveNextForkThreadTitle(["Refactor sidebar"], "Refactor sidebar"),
    "(1) Refactor sidebar",
  );
  assert.equal(
    deriveNextForkThreadTitle(
      ["Refactor sidebar", "(1) Refactor sidebar"],
      "Refactor sidebar",
    ),
    "(2) Refactor sidebar",
  );
  assert.equal(
    deriveNextForkThreadTitle(
      ["Refactor sidebar", "(1) Refactor sidebar"],
      "(1) Refactor sidebar",
    ),
    "(2) Refactor sidebar",
  );
});

test("deriveNextForkThreadTitle ignores unrelated thread titles", () => {
  const titles = ["Other chat", "(3) Other chat"];
  assert.equal(
    deriveNextForkThreadTitle(titles, "New topic"),
    "(1) New topic",
  );
});
