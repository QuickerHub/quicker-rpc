import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBrowserTarget } from "./resolve-target";

describe("resolveBrowserTarget", () => {
  it("defaults auto to headless", () => {
    assert.equal(
      resolveBrowserTarget({ embeddedAvailable: true }),
      "headless",
    );
  });

  it("uses embedded when showPanel and runtime available", () => {
    assert.equal(
      resolveBrowserTarget({ showPanel: true, embeddedAvailable: true }),
      "embedded",
    );
  });

  it("falls back to headless when showPanel but embedded unavailable", () => {
    assert.equal(
      resolveBrowserTarget({ showPanel: true, embeddedAvailable: false }),
      "headless",
    );
  });

  it("honors explicit headless", () => {
    assert.equal(
      resolveBrowserTarget({
        target: "headless",
        showPanel: true,
        embeddedAvailable: true,
      }),
      "headless",
    );
  });

  it("honors explicit embedded when available", () => {
    assert.equal(
      resolveBrowserTarget({ target: "embedded", embeddedAvailable: true }),
      "embedded",
    );
  });

  it("falls back explicit embedded when unavailable", () => {
    assert.equal(
      resolveBrowserTarget({ target: "embedded", embeddedAvailable: false }),
      "headless",
    );
  });
});
