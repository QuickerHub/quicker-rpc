import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createStepRunnerKnowledgeTools } from "./step-runner-knowledge-tools.server";
import { withModelFacingToolOutput } from "./tool-model-output";
import { TOOL_OUTPUT_MAX_INLINE_CHARS } from "./tool-result-model-messages";
import { KNOWLEDGE_PROJECTION_MAX_CHARS } from "./tool-knowledge-projection";
import { formatToolResultForAgent } from "./tool-result-agent-view";
import { buildModelFacingToolOutput } from "./tool-result-model-messages";
import { attachShellOutputArtifact, SHELL_ARTIFACT_THRESHOLD_CHARS } from "./agent-harness/artifacts/shell-artifact";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";

function knowledge(control: string | null = "") {
  return {
    schemaVersion: 1,
    source: {
      provider: "qkrpc.step-runner", kind: "runtime-definition", hostKind: "v1",
      quickerVersion: "native-fixture", adapterAssembly: "fixture.adapter", adapterVersion: "fixture+revision",
      hostInstanceId: "fixture-instance", hostSessionId: "a".repeat(32), endpoint: `fixture_${"a".repeat(32)}`,
    },
    schema: { format: "qkrpc.agent-step-runner.v1", revision: `sha256:${"b".repeat(64)}` },
    requestedControlFieldValue: control, retrievedAt: "2026-10-24T00:00:00Z", nativeHelpLink: "https://example.invalid/native-help",
  };
}

async function modelOf(data: unknown, overrides: Record<string, unknown> = {}) {
  const output = { ok: true, exitCode: 0, source: "qkrpc", data, ...overrides };
  const tool = withModelFacingToolOutput(createStepRunnerKnowledgeTools().qkrpc_step_runner_get);
  const model: any = await tool.toModelOutput!({ toolCallId: "projection-only", input: { key: "sys:fixture" }, output });
  assert.ok(JSON.stringify(model.value).length <= TOOL_OUTPUT_MAX_INLINE_CHARS);
  assert.equal(model.value.displayData, undefined);
  return model.value;
}

function oversizedData(metadata: unknown) {
  return { action: "step-runner-get", payload: { schema: {
    key: "sys:fixture", inputs: [{ key: "text", description: "large ".repeat(2_000) }], knowledge: metadata,
  } } };
}

for (const wire of ["http-model-budget", "http-hard-budget", "legacy-hard-budget"] as const) {
  test(`${wire} keeps bounded actual knowledge in the real model-output wrapper`, async () => {
    const metadata = knowledge("");
    const schema = {
      key: "sys:fixture", inputs: [{ key: "text", description: "large schema ".repeat(wire === "http-model-budget" ? 800 : 3_000) }],
      knowledge: wire === "legacy-hard-budget" ? { ...metadata, supplemental: "unbounded metadata ".repeat(2_000) } : metadata,
    };
    const raw = {
      ok: true, exitCode: 0, source: "qkrpc" as const,
      data: { ok: true, action: "step-runner-get", payload: {
        key: "sys:fixture", ...(wire.startsWith("legacy") ? { schemaJson: JSON.stringify(schema) } : { schema }),
      } },
    };
    const rawText = JSON.stringify(raw);
    let calls = 0;
    const tool = withModelFacingToolOutput(createStepRunnerKnowledgeTools(async () => { calls++; return raw; }).qkrpc_step_runner_get);
    const input = { key: "sys:fixture", controlField: "" };
    const output: any = await tool.execute!(input, { toolCallId: wire, messages: [] });
    const model: any = await tool.toModelOutput!({ toolCallId: wire, input, output });
    assert.equal(calls, 1, "Projection cannot refetch or execute another operation");
    assert.equal(JSON.stringify(raw), rawText, "The native result is immutable");
    assert.deepEqual(output.displayData, raw.data, "The original UI/history result is retained");
    assert.equal(model.value.displayData, undefined);
    assert.ok(JSON.stringify(model.value).length <= TOOL_OUTPUT_MAX_INLINE_CHARS);
    const projection = model.value.data.knowledgeProjection;
    assert.ok(projection, "The final model result lost structured knowledge provenance");
    assert.equal(projection.schemaComplete, false);
    assert.deepEqual(projection.knowledge.source, metadata.source);
    assert.deepEqual(projection.knowledge.schema, metadata.schema);
    assert.equal(projection.knowledge.requestedControlFieldValue, "");
    assert.equal(projection.knowledge.retrievedAt, metadata.retrievedAt);
    assert.match(projection.notice, /not.*editing contract/i);
    assert.equal(projection.metadataStatus, wire === "legacy-hard-budget" ? "partial" : "preserved");
    assert.ok(!output.nextActions?.some((action: any) => action.reason === "full_schema"), "Identical get cannot return a full schema through the same budget");
  });
}

test("projection keeps exact control literals and zero/false/null without inventing absent fields", async () => {
  for (const control of [null, "", " ", " MiXeD ", "$$ literal", "引号\"\\\n"]) {
    const metadata = { ...knowledge(control), nativeHelpLink: null, bundledReference: { source: "bundled-fallback", bundleVersion: 0, indexRevision: false } };
    const model = await modelOf(oversizedData(metadata));
    const projection = model.data.knowledgeProjection;
    assert.equal(projection.metadataStatus, "preserved");
    assert.deepEqual(projection.knowledge, metadata);
    assert.equal(projection.schemaComplete, false);
    assert.deepEqual(buildModelFacingToolOutput(model), model, "History/model projection is idempotent");
  }
});

test("oversized metadata is explicitly partial and identities are omitted whole", async () => {
  const metadata = knowledge();
  metadata.source.endpoint = "do-not-truncate-this-identity".repeat(400);
  metadata.source.adapterVersion = "\u0000".repeat(200); // Escaped JSON length, not raw character count.
  const model = await modelOf(oversizedData(metadata));
  const projection = model.data.knowledgeProjection;
  assert.equal(projection.metadataStatus, "partial");
  assert.equal(projection.schemaComplete, false);
  assert.equal(Object.hasOwn(projection.knowledge.source, "endpoint"), false);
  assert.equal(Object.hasOwn(projection.knowledge.source, "adapterVersion"), false);
  assert.ok(projection.omittedFields.includes("source.endpoint"));
  assert.ok(projection.omittedFields.includes("source.adapterVersion"));
  assert.equal(projection.knowledge.source.hostSessionId, metadata.source.hostSessionId);
  assert.ok(JSON.stringify(projection).length <= KNOWLEDGE_PROJECTION_MAX_CHARS);
});

test("the projection's own aggregate budget bounds many allowed metadata fields", async () => {
  const metadata: any = knowledge();
  for (const key of Object.keys(metadata.source)) {
    if (key !== "provider" && key !== "kind") metadata.source[key] = "长\"\\".repeat(80);
  }
  metadata.retrievedAt = "x".repeat(500);
  metadata.nativeHelpLink = "x".repeat(500);
  metadata.requestedControlFieldValue = "x".repeat(500);
  const model = await modelOf(oversizedData(metadata));
  assert.equal(model.data.knowledgeProjection.metadataStatus, "partial");
  assert.ok(JSON.stringify(model.data.knowledgeProjection).length <= KNOWLEDGE_PROJECTION_MAX_CHARS);
});

test("missing, malformed and unknown provenance cannot acquire client-created proof", async () => {
  for (const metadata of [undefined, null, [], "invalid", {}, { source: {} }, { ...knowledge(), source: { ...knowledge().source, kind: "unknown" } }]) {
    const model = await modelOf(oversizedData(metadata), { displayData: oversizedData(knowledge("old display value")) });
    const projection = model.data.knowledgeProjection;
    assert.equal(projection.schemaComplete, false);
    assert.equal(projection.metadataStatus, "unknown");
    assert.doesNotMatch(JSON.stringify(projection), /old display value/);
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object" || !Object.hasOwn(metadata, "retrievedAt")) {
      assert.equal(projection.knowledge?.retrievedAt, undefined);
    }
  }
  const malformed = await modelOf({ action: "step-runner-get", payload: { schemaJson: '{"knowledge":' + " ".repeat(12_000) } });
  assert.equal(malformed.data.knowledgeProjection.metadataStatus, "unknown");
  assert.equal(malformed.data.knowledgeProjection.knowledge, undefined);
});

test("a failed or cancelled read carrying old schema never projects successful current metadata", async () => {
  for (const failure of ["tool", "transport-payload", "native", "native-uppercase", "cancelled"]) {
    const data: any = oversizedData(knowledge());
    const overrides: any = { stderr: "ORIGINAL_READ_ERROR", retryable: false };
    if (failure === "tool" || failure === "cancelled") { overrides.ok = false; overrides.exitCode = 1; }
    if (failure === "transport-payload") data.ok = false;
    if (failure === "native") data.payload.success = false;
    if (failure === "native-uppercase") data.payload.Success = false;
    if (failure === "cancelled") overrides.stderr = "AbortError: operation cancelled";
    const model = await modelOf(data, overrides);
    assert.equal(model.ok, overrides.ok ?? true);
    assert.equal(model.retryable, false);
    assert.equal(model.stderr, overrides.stderr);
    assert.equal(model.data.knowledgeProjection.metadataStatus, "unknown");
    assert.equal(model.data.knowledgeProjection.knowledge, undefined);
    assert.match(model.data.knowledgeProjection.notice, /unsuccessful/i);
  }
});

test("JSON escaping, Unicode, stderr and wrapper overhead stay within the original budget", async () => {
  for (const atom of ["\"\\\n\u0000", "😀汉字", "\ud800", "\\\"\\\""]) {
    const data: any = oversizedData(knowledge("\" 控制 "));
    data.payload.schema.inputs[0].description = atom.repeat(15_000);
    const model = await modelOf(data, { stderr: "\u0000".repeat(5_000), summary: "\u0000".repeat(5_000) });
    assert.equal(model.data.knowledgeProjection.metadataStatus, "preserved");
    assert.equal(model.data.knowledgeProjection.knowledge.requestedControlFieldValue, "\" 控制 ");
  }
});

test("small results, unrelated providers and existing artifact references retain their behavior", async () => {
  const small = { ok: true, exitCode: 0, data: { artifactRef: { path: ".tmp/generated.txt", format: "text", bytesWritten: 42 }, readHint: "Read the existing artifact" }, displayData: { raw: "original" } };
  assert.deepEqual(buildModelFacingToolOutput(small), { ok: true, exitCode: 0, data: small.data });
  const unrelated = await modelOf({ action: "unrelated", schema: { knowledge: knowledge() }, text: "x".repeat(12_000) });
  assert.equal(unrelated.data.knowledgeProjection, undefined, "This slice does not claim other provider contracts");
});

test("hard-budget fallback preserves other nextActions without adding a same-get full-schema claim", async () => {
  const native: any = {
    ok: true, exitCode: 0, source: "qkrpc", data: oversizedData(knowledge()),
    nextActions: [{ tool: "Read", reason: "existing_artifact", input: { path: ".tmp/generated.txt" }, priority: "optional" }],
  };
  native.data.payload.schema.inputs[0].description = "x".repeat(40_000);
  const shaped: any = formatToolResultForAgent("qkrpc_step_runner_get", { key: "sys:fixture", controlField: "" }, native);
  assert.deepEqual(shaped.nextActions, native.nextActions);
  assert.deepEqual(shaped.displayData, native.data);
  assert.equal(shaped.data.agentPayload, "summary_only");
  assert.equal(shaped.data.knowledgeProjection.schemaComplete, false);
  assert.deepEqual(shaped.data.knowledgeProjection.knowledge, knowledge());
});

test("the existing owned Shell artifact remains readable after the model wrapper strips displayData", async () => {
  const tempRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
  await mkdir(tempRoot, { recursive: true });
  const owned = await mkdtemp(join(tempRoot, "knowledge-artifact-"));
  try {
    await runWithAgentRequestContextAsync({ cwd: owned, artifactDir: "artifacts", threadId: "synthetic-knowledge-budget" }, async () => {
      const text = "generated fixture output\n".repeat(Math.ceil(SHELL_ARTIFACT_THRESHOLD_CHARS / 24) + 100);
      const artifact = await attachShellOutputArtifact(text, { toolCallId: "owned-shell-output" });
      assert.ok(artifact);
      const output = { ok: true, exitCode: 0, source: "local", data: artifact, displayData: { text } };
      const model = buildModelFacingToolOutput(output) as typeof output;
      assert.equal(model.displayData, undefined);
      assert.deepEqual(model.data.artifactRef, artifact.artifactRef);
      const file = resolve(owned, artifact.artifactRef.path);
      assert.ok(file.startsWith(`${owned}${sep}`));
      assert.equal(await readFile(file, "utf8"), text.trimEnd());
      assert.equal(model.data.readHint, artifact.readHint);
    });
  } finally {
    const absolute = await realpath(owned);
    const expectedParent = await realpath(tempRoot);
    assert.equal(dirname(absolute), expectedParent);
    assert.ok(absolute.startsWith(join(expectedParent, "knowledge-artifact-")));
    await rm(absolute, { recursive: true, force: true });
  }
});

test("the full hard-budget/tool-wrapper path never revives a failed native schema", async () => {
  const data: any = oversizedData(knowledge());
  data.payload.success = false;
  data.payload.errorMessage = "native definition unavailable";
  data.payload.schema.inputs[0].description = "x".repeat(40_000);
  const tool = withModelFacingToolOutput(createStepRunnerKnowledgeTools(async () => ({ ok: true, exitCode: 0, source: "qkrpc", data })).qkrpc_step_runner_get);
  const input = { key: "sys:fixture" };
  const output: any = await tool.execute!(input, { toolCallId: "failed-hard-budget", messages: [] });
  const model: any = await tool.toModelOutput!({ toolCallId: "failed-hard-budget", input, output });
  assert.equal(model.value.data.knowledgeProjection.metadataStatus, "unknown");
  assert.equal(model.value.data.knowledgeProjection.knowledge, undefined);
  assert.deepEqual(output.displayData, data);
});
