import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkCiResult, HEAVY_JOBS } from "./check-ci-result.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(repository, "scripts/ci/check-ci-result.mjs");
const makeNeeds = (scope = "full", result = "success") => ({ docs: { result: "success", outputs: { scope } },
  ...Object.fromEntries(HEAVY_JOBS.map((job) => [job, { result }])) });

test("the full gate accepts only success from every required job", () => {
  assert.deepEqual(checkCiResult(makeNeeds()), { ok: true, scope: "full" });
  for (const job of HEAVY_JOBS) for (const result of ["failure", "cancelled", "skipped", "neutral", "timed_out", "queued", null, undefined, "SUCCESS"]) {
    const needs = makeNeeds(); needs[job] = { result };
    assert.throws(() => checkCiResult(needs), undefined, `${job}: ${result}`);
  }
});

test("only successful docs-only classification authorizes deliberate heavy-job skips", () => {
  assert.deepEqual(checkCiResult(makeNeeds("docs-only", "skipped")), { ok: true, scope: "docs-only" });
  const mixed = makeNeeds("docs-only", "skipped"); mixed.agent.result = "success";
  assert.equal(checkCiResult(mixed).ok, true);
  for (const job of HEAVY_JOBS) for (const result of ["failure", "cancelled", "neutral", "timed_out", null, undefined]) {
    const needs = makeNeeds("docs-only", "skipped"); needs[job] = { result };
    assert.throws(() => checkCiResult(needs), undefined, `${job}: ${result}`);
  }
  for (const result of ["failure", "cancelled", "skipped", null, undefined]) {
    const needs = makeNeeds("docs-only", "skipped"); needs.docs.result = result;
    assert.throws(() => checkCiResult(needs));
  }
});

test("unknown scope, missing jobs and unexpected jobs cannot produce a successful required result", () => {
  for (const scope of [undefined, null, "", "docs", "FULL", "docs-only\n", true, {}, []]) {
    const needs = makeNeeds(); needs.docs.outputs.scope = scope;
    assert.throws(() => checkCiResult(needs));
  }
  for (const key of ["docs", ...HEAVY_JOBS]) { const needs = makeNeeds(); delete needs[key]; assert.throws(() => checkCiResult(needs)); }
  const extra = makeNeeds(); extra["unregistered-job"] = { result: "success" }; assert.throws(() => checkCiResult(extra));
  for (const needs of [undefined, null, [], {}, "success"]) assert.throws(() => checkCiResult(needs));
});

test("CLI success and failure preserve the required check exit status", () => {
  for (const [payload, expected] of [[JSON.stringify(makeNeeds()), 0], [JSON.stringify(makeNeeds("docs-only", "skipped")), 0],
    [JSON.stringify(makeNeeds("full", "skipped")), 1], ["invalid JSON", 1], ["null", 1]]) {
    const result = spawnSync(process.execPath, [script], { env: { ...process.env, CI_NEEDS_JSON: payload }, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, expected, result.stderr);
    if (expected === 0) assert.equal(JSON.parse(result.stdout).ok, true);
    else assert.ok(result.stderr.trim());
  }
});

test("workflow wiring preserves existing check names, unconditional documentation and the complete required dependency set", () => {
  const source = readFileSync(join(repository, ".github/workflows/ci.yml"), "utf8").replaceAll("\r\n", "\n");
  const body = source.slice(source.indexOf("\njobs:\n") + 7), matches = [...body.matchAll(/^  ([\w-]+):$/gm)];
  const jobs = Object.fromEntries(matches.map((match, index) => [match[1], body.slice(match.index, matches[index + 1]?.index)]));
  assert.deepEqual(Object.keys(jobs).sort(), ["docs", ...HEAVY_JOBS, "required"].sort());
  const name = (job) => /^    name: (.+)$/m.exec(jobs[job])?.[1];
  assert.equal(name("docs"), "Generated knowledge");
  assert.equal(name("agent"), "Offline Agent (${{ matrix.os }})");
  assert.equal(name("designer-dom"), "Designer DOM (Windows Edge)");
  assert.equal(name("static-spa"), "Static SPA (Windows Edge)");
  assert.equal(name("transport-linux"), "Transport contracts (Ubuntu)");
  assert.equal(name("dotnet"), "Host-independent .NET");
  assert.equal(name("required"), "CI required");
  assert.match(jobs.docs, /fetch-depth: 0/);
  for (const command of ["node scripts/generate-authoring-docs.mjs --check", "node scripts/ci/check-documentation-links.mjs"]) {
    const before = jobs.docs.slice(0, jobs.docs.indexOf(`run: ${command}`));
    assert.match(before.slice(before.lastIndexOf("      - name:")), /if: \$\{\{ !cancelled\(\) \}\}/);
  }
  for (const job of HEAVY_JOBS) {
    assert.match(jobs[job], /^    needs: docs$/m);
    assert.match(jobs[job], /if: \$\{\{ !cancelled\(\) && \(needs\.docs\.result != 'success' \|\| needs\.docs\.outputs\.scope != 'docs-only'\) \}\}/);
    assert.doesNotMatch(jobs[job], /continue-on-error: true/);
  }
  assert.match(jobs.agent, /fail-fast: false/);
  assert.match(jobs.agent, /os: \[ubuntu-24\.04, windows-2025\]/);
  const dependencies = /^    needs: \[([^\]]+)\]$/m.exec(jobs.required)?.[1].split(",").map((value) => value.trim());
  assert.deepEqual(dependencies?.sort(), ["docs", ...HEAVY_JOBS].sort());
  assert.match(jobs.required, /^    if: \$\{\{ always\(\) \}\}$/m);
  assert.match(jobs.required, /CI_NEEDS_JSON: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(jobs.required, /run: node scripts\/ci\/check-ci-result\.mjs/);
  assert.doesNotMatch(source.slice(0, source.indexOf("\njobs:\n")), /paths(?:-ignore)?:/);
});
