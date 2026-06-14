import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRipgrepArgs,
  parseRipgrepJsonLine,
} from "./grep-workspace-core.ts";

test("buildRipgrepArgs includes pattern, glob, and case flag", () => {
  const args = buildRipgrepArgs(
    {
      pattern: "fooBar",
      glob: "*.ts",
      caseInsensitive: true,
      outputMode: "content",
    },
    "agent-gui/lib",
  );
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("-i"));
  assert.ok(args.includes("--glob"));
  assert.ok(args.includes("*.ts"));
  assert.ok(args.includes("fooBar"));
  assert.ok(args.includes("agent-gui/lib"));
});

test("parseRipgrepJsonLine extracts relative path and line", () => {
  const root = process.cwd();
  const absPath = `${root}/agent-gui/lib/foo.ts`;
  const line = JSON.stringify({
    type: "match",
    data: {
      path: { text: absPath },
      lines: { text: "export const x = 1;\n" },
      line_number: 42,
    },
  });
  const match = parseRipgrepJsonLine(line, root);
  assert.ok(match);
  assert.equal(match.line, 42);
  assert.match(match.path, /agent-gui\/lib\/foo\.ts$/);
  assert.equal(match.content, "export const x = 1;");
});

test("parseRipgrepJsonLine ignores non-match records", () => {
  assert.equal(parseRipgrepJsonLine(JSON.stringify({ type: "begin" }), process.cwd()), null);
});
