import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessageScrollFrameOwner } from "./message-scroll-frame-owner";

function driver() {
  let next = 0;
  const callbacks = new Map<number, FrameRequestCallback>(), cancelled: number[] = [];
  return {
    request(callback: FrameRequestCallback) { callbacks.set(++next, callback); return next; },
    cancel(id: number) { cancelled.push(id); },
    // Deliver cancelled entries too: an already captured batch must be harmless.
    deliver(id: number) { callbacks.get(id)!(0); },
    cancelled,
    get requested() { return next; },
  };
}

test("retiring one chat rejects captured callbacks without cancelling another chat's frames", () => {
  const frames = driver(), a = createMessageScrollFrameOwner(frames.request, frames.cancel),
    b = createMessageScrollFrameOwner(frames.request, frames.cancel);
  let writesA = 0, writesB = 0;
  a.schedule(() => writesA++); b.schedule(() => writesB++);
  a.dispose(); a.dispose(); frames.deliver(1); frames.deliver(2);
  assert.equal(writesA, 0); assert.equal(writesB, 1);
  assert.deepEqual(frames.cancelled, [1]);
  a.schedule(() => writesA++); assert.equal(frames.requested, 2);
  assert.equal(a.active, false); assert.equal(b.active, true);
});

test("nested frames belong to the same owner and each delivery is consumed once", () => {
  const frames = driver(), owner = createMessageScrollFrameOwner(frames.request, frames.cancel);
  let writes = 0;
  owner.schedule(() => { writes++; owner.schedule(() => writes++); });
  frames.deliver(1); frames.deliver(1);
  assert.equal(writes, 1); assert.equal(frames.requested, 2);
  owner.dispose(); frames.deliver(2);
  assert.equal(writes, 1); assert.deepEqual(frames.cancelled, [2]);
});

test("a layout can cancel its own second frame while other current work remains alive", () => {
  const frames = driver(), owner = createMessageScrollFrameOwner(frames.request, frames.cancel);
  let oldLayout = 0, currentLayout = 0;
  const cancelOld = owner.schedule(() => oldLayout++);
  owner.schedule(() => currentLayout++);
  cancelOld(); cancelOld(); frames.deliver(1); frames.deliver(2);
  owner.dispose();
  assert.equal(oldLayout, 0); assert.equal(currentLayout, 1); assert.deepEqual(frames.cancelled, [1]);
});
