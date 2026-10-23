import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createProgramDocumentSession } from "../document/programDocumentSession";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import { writeWorkspaceFile } from "@/lib/workspace-fs";
import { normalizeProgramWireForDisk } from "./normalizeProgramWireForDisk";

async function withFixture(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, "agent-gui-wire-disk-"));
  try {
    await run(root);
  } finally {
    assert.equal(dirname(await realpath(root)), parent);
    await rm(root, { recursive: true, force: true });
  }
}

function nativeFixture() {
  return {
    futureProgram: { enabled: true, schema: ["future", 7] },
    files: { "files/body.cs": { futureFile: "opaque" } },
    steps: [{
      stepId: "branch", stepRunnerKey: "future:branch", futureStep: { token: 7 }, note: "before",
      inputParams: {
        script: { File: " files\\body.cs " },
        extension: { value: "old", futureParam: { kept: true } },
        target: { VarKey: " mainText " },
      },
      ifSteps: [{
        stepId: "if", stepRunnerKey: "future:if-child", futureNested: [1, 2],
        inputParams: { ms: { Value: "10" } },
      }],
      elseSteps: [{
        stepId: "else", stepRunnerKey: "future:else-child", futureElse: { kept: true },
        inputParams: { script: { file: "files/else.cs" } },
      }],
    }],
    variables: [{
      id: "v", key: "mainText", defaultValue: { file: " files\\default.txt " },
      futureVariable: { retained: true }, inputParamInfo: { futureInfo: { n: 1 } },
    }],
    subPrograms: [{
      id: "sub", name: "Sub", kind: 1, futureSub: { color: "opaque" },
      steps: [{
        stepId: "sub-step", stepRunnerKey: "future:sub-branch", futureSubStep: true,
        inputParams: { script: { file: "files/sub.cs" } },
        elseSteps: [{ stepId: "sub-else", stepRunnerKey: "sys:delay", inputParams: { ms: { value: "20" } }, futureSubBranch: "retained" }],
      }],
      variables: [{ id: "sv", key: "subText", defaultValueFile: " files\\sub-default.txt ", futureSubVariable: true }],
      subPrograms: [{ id: "inner", name: "Inner", futureInner: { retained: true }, steps: [], variables: [] }],
    }],
  };
}

test("document save survives the real workspace disk normalizer with unknown fields, branches and file references", async () => {
  await withFixture(async (root) => {
    const relative = ".quicker/actions/fixture/data.json";
    const project = join(root, ".quicker", "actions", "fixture");
    const externalFiles = {
      "body.cs": "// fixture main script\n",
      "else.cs": "// fixture branch script\n",
      "sub.cs": "// fixture subprogram script\n",
      "default.txt": "fixture main default\n",
      "sub-default.txt": "fixture subprogram default\n",
    };
    await mkdir(join(project, "files"), { recursive: true });
    for (const [name, content] of Object.entries(externalFiles)) {
      await writeFile(join(project, "files", name), content, "utf8");
    }
    const native = nativeFixture();
    const session = createProgramDocumentSession({
      content: JSON.stringify(native),
      identity: { documentKey: relative, storage: { key: relative } },
    });
    try {
      const live = session.readSnapshot();
      live.steps[0]!.note = "edited in designer";
      live.steps[0]!.inputParams.extension!.value = "edited parameter";
      live.steps[0]!.ifSteps[0]!.inputParams.ms!.value = "11";
      live.variables[0]!.desc = "edited main variable";
      live.variables[0]!.inputParamInfo!.isRequired = true;
      live.subPrograms[0]!.steps[0]!.note = "edited subprogram";
      live.subPrograms[0]!.variables[0]!.desc = "edited subprogram variable";
      live.subPrograms[0]!.subPrograms[0]!.description = "edited nested subprogram";
      const started = session.beginSave(() => live);
      if (!started.ok) assert.fail(started.error);
      assert.equal(started.ticket.revision, 1);

      // This is the server write entry point, including its data.json normalization.
      const written = await runWithQkrpcCwd(root, () => writeWorkspaceFile(relative, started.ticket.content));
      if (!written.ok) assert.fail(written.error);
      const diskText = await readFile(join(project, "data.json"), "utf8");
      assert.equal(written.bytesWritten, Buffer.byteLength(diskText, "utf8"));
      const disk = JSON.parse(diskText);
      assert.deepEqual(disk.futureProgram, native.futureProgram);
      assert.deepEqual(disk.files, native.files);
      assert.equal(disk.steps[0].note, "edited in designer");
      assert.deepEqual(disk.steps[0].futureStep, native.steps[0]!.futureStep);
      assert.deepEqual(disk.steps[0].inputParams.extension, { value: "edited parameter", futureParam: { kept: true } });
      assert.equal(disk.steps[0].inputParams["script.file"], "files/body.cs");
      assert.equal(disk.steps[0].inputParams["target.var"], "mainText");
      assert.equal(disk.steps[0].ifSteps[0].stepRunnerKey, "future:if-child");
      assert.equal(disk.steps[0].ifSteps[0].inputParams.ms, "11");
      assert.deepEqual(disk.steps[0].ifSteps[0].futureNested, [1, 2]);
      assert.deepEqual(disk.steps[0].elseSteps[0].futureElse, { kept: true });
      assert.equal(disk.steps[0].elseSteps[0].inputParams["script.file"], "files/else.cs");
      assert.deepEqual(disk.variables[0].futureVariable, native.variables[0]!.futureVariable);
      assert.deepEqual(disk.variables[0].inputParamInfo.futureInfo, { n: 1 });
      assert.equal(disk.variables[0].inputParamInfo.isRequired, true);
      assert.equal(disk.variables[0].desc, "edited main variable");
      assert.equal(disk.variables[0]["default.file"], "files/default.txt");
      assert.equal(Object.hasOwn(disk.variables[0], "defaultValue"), false);
      assert.deepEqual(disk.subPrograms[0].futureSub, native.subPrograms[0]!.futureSub);
      assert.equal(disk.subPrograms[0].steps[0].futureSubStep, true);
      assert.equal(disk.subPrograms[0].steps[0].note, "edited subprogram");
      assert.equal(disk.subPrograms[0].steps[0].inputParams["script.file"], "files/sub.cs");
      assert.equal(disk.subPrograms[0].steps[0].elseSteps[0].futureSubBranch, "retained");
      assert.equal(disk.subPrograms[0].steps[0].elseSteps[0].inputParams.ms, "20");
      assert.equal(disk.subPrograms[0].variables[0].futureSubVariable, true);
      assert.equal(disk.subPrograms[0].variables[0]["default.file"], "files/sub-default.txt");
      assert.equal(Object.hasOwn(disk.subPrograms[0].variables[0], "defaultValueFile"), false);
      assert.deepEqual(disk.subPrograms[0].subPrograms[0].futureInner, { retained: true });
      assert.equal(disk.subPrograms[0].subPrograms[0].description, "edited nested subprogram");
      for (const [name, content] of Object.entries(externalFiles)) {
        assert.equal(await readFile(join(project, "files", name), "utf8"), content);
      }
    } finally {
      session.close();
    }
  });
});

test("workspace writes still compact legacy object bindings and defaults for every program data path", async () => {
  await withFixture(async (root) => {
    const content = JSON.stringify({
      future: "retained",
      steps: [{ stepRunnerKey: "future:runner", inputParams: {
        text: { Value: "literal" }, script: { File: " files\\script.cs " }, target: { VarKey: " output " },
      } }],
      variables: [
        { key: "inline", defaultValue: 42, future: true },
        { key: "file", "defaultValue.file": " files\\default.txt ", future: "kept" },
      ],
    });
    for (const path of [
      ".quicker/actions/fixture/data.json",
      ".quicker/subprograms/fixture/data.json",
      ".quicker/actions/fixture/subprograms/embedded/data.json",
    ]) {
      const result = await runWithQkrpcCwd(root, () => writeWorkspaceFile(path, content));
      if (!result.ok) assert.fail(result.error);
      const disk = JSON.parse(await readFile(join(root, path), "utf8"));
      assert.deepEqual(disk.steps[0].inputParams, { text: "literal", "script.file": "files/script.cs", "target.var": "output" });
      assert.deepEqual(disk.variables, [
        { key: "inline", default: "42", future: true },
        { key: "file", "default.file": "files/default.txt", future: "kept" },
      ]);
      assert.equal(disk.future, "retained");
    }
  });
});

test("opaque future input objects retain their entire binding group and disk normalization is idempotent", () => {
  const opaque = { File: "files/future.cs", futureBinding: { mode: 9 } };
  const raw = {
    steps: [{ stepRunnerKey: "future:branch", inputParams: {
      "extension.file": opaque, "extension.var": "fallback", known: { Value: "legacy" },
    }, elseSteps: [{ stepRunnerKey: "future:nested", inputParams: { count: { Value: "2" } }, futureNested: true }] }],
    variables: [], futureRoot: { retained: true },
  };
  const normalized = normalizeProgramWireForDisk(JSON.stringify(raw));
  const disk = JSON.parse(normalized);
  assert.deepEqual(disk.steps[0].inputParams, { "extension.file": opaque, "extension.var": "fallback", known: "legacy" });
  assert.equal(disk.steps[0].elseSteps[0].inputParams.count, "2");
  assert.equal(disk.steps[0].elseSteps[0].futureNested, true);
  assert.deepEqual(disk.futureRoot, raw.futureRoot);
  assert.equal(normalizeProgramWireForDisk(normalized), normalized);
});

test("malformed JSON and non-object roots pass through without a lossy projection", () => {
  for (const content of ["{ broken", "  null\n", " [1, {\"future\":true}] ", "42", '"literal"']) {
    assert.equal(normalizeProgramWireForDisk(content), content);
  }
});

test("opaque default objects survive the document-to-disk chain when the known binding changes", async () => {
  await withFixture(async (root) => {
    const path = ".quicker/actions/fixture/data.json";
    const session = createProgramDocumentSession({ content: JSON.stringify({
      steps: [], variables: [{ id: "file-var", key: "script", defaultValue: {
        file: "files/original.txt", futureDefault: { mode: 7 },
      } }],
    }), identity: { documentKey: path } });
    const snapshot = session.readSnapshot();
    snapshot.variables[0]!.defaultValue = "new inline value";
    delete (snapshot.variables[0]! as typeof snapshot.variables[number] & { defaultValueFile?: string }).defaultValueFile;
    const started = session.beginSave(() => snapshot);
    if (!started.ok) assert.fail(started.error);
    const written = await runWithQkrpcCwd(root, () => writeWorkspaceFile(path, started.ticket.content));
    if (!written.ok) assert.fail(written.error);
    const variable = JSON.parse(await readFile(join(root, path), "utf8")).variables[0];
    assert.equal(variable.default, "new inline value");
    assert.deepEqual(variable.defaultValue, { futureDefault: { mode: 7 } });
    assert.equal(Object.hasOwn(variable, "default.file"), false);
    session.close();
  });
});

test("all opaque default aliases survive actual disk writes and remain distinct from external changes", async () => {
  await withFixture(async (root) => {
    for (const alias of ["defaultValue", "default", "DefaultValue", "default_value"]) {
      const path = `.quicker/actions/fixture-${alias}/data.json`;
      const opaque = { futureDefault: { x: 1 } };
      const session = createProgramDocumentSession({ content: JSON.stringify({
        steps: [], variables: [{ id: "v", key: "text", [alias]: opaque }],
      }), identity: { documentKey: path } });
      try {
        const snapshot = session.readSnapshot();
        snapshot.variables[0]!.desc = "description changed";
        (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile = "files/current.txt";
        const started = session.beginSave(() => snapshot);
        if (!started.ok) assert.fail(started.error);
        const written = await runWithQkrpcCwd(root, () => writeWorkspaceFile(path, started.ticket.content));
        if (!written.ok) assert.fail(written.error);
        const diskText = await readFile(join(root, path), "utf8");
        const disk = JSON.parse(diskText);
        assert.deepEqual(disk.variables[0][alias], opaque, alias);
        assert.equal(disk.variables[0]["default.file"], "files/current.txt", alias);
        assert.equal(session.isSaveAcknowledgement(diskText), true, alias);
        session.completeSave(started.ticket, { ok: true });
        assert.equal(session.isSaveAcknowledgement(diskText), true, alias);
        disk.variables[0][alias].futureDefault.x = 2;
        assert.equal(session.isSaveAcknowledgement(JSON.stringify(disk)), false, alias);
      } finally {
        session.close();
      }
    }
  });
});
