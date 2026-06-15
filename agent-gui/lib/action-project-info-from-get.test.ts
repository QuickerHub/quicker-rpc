import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeEditVersion,
  readEditVersionFromGetPayload,
} from "@/lib/action-project-info-from-get";

test("normalizeEditVersion treats zero and negative as missing", () => {
  assert.equal(normalizeEditVersion(0), undefined);
  assert.equal(normalizeEditVersion(-1), undefined);
  assert.equal(normalizeEditVersion(undefined), undefined);
  assert.equal(normalizeEditVersion(1780917082345), 1780917082345);
});

test("readEditVersionFromGetPayload ignores zero and reads compressed fallback", () => {
  assert.equal(
    readEditVersionFromGetPayload({ editVersion: 0 }),
    undefined,
  );
  assert.equal(
    readEditVersionFromGetPayload({
      compressed: { editVersion: 42 },
    }),
    42,
  );
});
