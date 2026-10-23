import assert from "node:assert/strict";
import { test } from "node:test";
import { isReleasePreviewActive, runWithReleasePreview } from "./release-preview-context";

test("headless runtime preview contexts stay isolated across concurrent requests", async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithReleasePreview(true, async () => {
    await barrier;
    assert.equal(isReleasePreviewActive(), true);
    await assert.rejects(runWithReleasePreview(false, async () => {
      assert.equal(isReleasePreviewActive(), false);
      throw new Error("nested adapter failed");
    }));
    assert.equal(isReleasePreviewActive(), true);
  });
  const second = runWithReleasePreview(false, async () => {
    assert.equal(isReleasePreviewActive(), false);
    release();
    await first;
    assert.equal(isReleasePreviewActive(), false);
  });
  await Promise.all([first, second]);
  assert.equal(isReleasePreviewActive(), false);
});
