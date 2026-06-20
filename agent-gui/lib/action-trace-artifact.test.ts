import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActionTraceArtifactPath,
  buildActionTraceStepSummaries,
  parseActionTraceArtifactDocument,
  readActionTraceRef,
  sanitizeActionIdForArtifactPath,
} from "@/lib/action-trace-artifact";

describe("action-trace-artifact", () => {
  it("builds capped step summaries from step_begin events", () => {
    const events = [
      { kind: "step_begin", stepRunnerName: "assign", elapsedMs: 12, stepPath: "0" },
      { kind: "input", paramKey: "x", depth: 1 },
      { kind: "step_begin", note: "截图", elapsedMs: 4317, stepPath: "1" },
    ];
    const summaries = buildActionTraceStepSummaries(events);
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].name, "assign");
    assert.equal(summaries[0].elapsedMs, 12);
    assert.equal(summaries[1].name, "截图");
    assert.equal(summaries[1].elapsedMs, 4317);
  });

  it("sanitizes action id for artifact path", () => {
    const id = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890";
    assert.equal(
      sanitizeActionIdForArtifactPath(id),
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
    assert.match(
      buildActionTraceArtifactPath(id, "trace-1"),
      /^\.local\/action-trace\/[a-z0-9-]+\/trace-1\.json$/,
    );
  });

  it("parses artifact documents and trace refs", () => {
    const doc = {
      version: 1,
      actionId: "00000000-0000-0000-0000-000000000001",
      ok: true,
      eventCount: 1,
      events: [{ kind: "step_begin", stepRunnerName: "assign" }],
      text: "> assign",
    };
    const parsed = parseActionTraceArtifactDocument(JSON.stringify(doc));
    assert.ok(parsed);
    assert.equal(parsed.eventCount, 1);
    assert.equal(parsed.events[0].stepRunnerName, "assign");

    const ref = readActionTraceRef({
      path: ".local/action-trace/foo/bar.json",
      format: "action-trace-v1",
    });
    assert.equal(ref?.path, ".local/action-trace/foo/bar.json");
    assert.equal(readActionTraceRef({ path: "x", format: "other" }), null);
  });
});
