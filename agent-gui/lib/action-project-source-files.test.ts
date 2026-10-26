import assert from "node:assert/strict";
import test from "node:test";
import { buildActionProjectSourceFileTabs } from "@/lib/action-project-source-files";

test("buildActionProjectSourceFileTabs orders data, info, then files", () => {
  const projectDir = ".quicker/actions/abc";
  const dataPath = `${projectDir}/data.json`;
  const tabs = buildActionProjectSourceFileTabs(projectDir, dataPath, [
    { path: "data.json", kind: "file" },
    { path: "info.json", kind: "file" },
    { path: "files/b.eval.cs", kind: "file" },
    { path: "files/a.form.json", kind: "file" },
    { path: "subprograms/x/info.json", kind: "file" },
    { path: "files", kind: "directory" },
  ]);

  assert.deepEqual(
    tabs.map((tab) => tab.label),
    ["data.json", "info.json", "files/a.form.json", "files/b.eval.cs"],
  );
  assert.equal(tabs[0]?.path, dataPath);
  assert.equal(tabs[1]?.path, `${projectDir}/info.json`);
});

test("source bundle tabs retain the actual YAML label and project-relative resource paths", () => {
  assert.deepEqual(buildActionProjectSourceFileTabs(".tmp/owned", ".tmp/owned/program.source.yaml", [
    { path: "program.source.yaml", kind: "file" }, { path: "quicker.source.json", kind: "file" },
    { path: ".qkrpc/baseline.json", kind: "file" }, { path: "files/script.cs", kind: "file" },
  ]), [{ path: ".tmp/owned/program.source.yaml", label: "program.source.yaml" }, { path: ".tmp/owned/files/script.cs", label: "files/script.cs" }]);
});
