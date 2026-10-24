import assert from "node:assert/strict";
import { test } from "node:test";
import { moduleHelpLink, safeModuleHelpUrl, withDocsEmbedQuery } from "./moduleHelpLink";
import { mapAgentSchemaToStepRunnerItem } from "../../api/stepRunnerSchemaMap";
import { runnerSchemaFingerprint } from "./stepEditorDraftSync";
import { augmentStepRunnerItemForSubProgramEdit } from "../subProgramStepRunnerAugment";

test("module help accepts explicit http(s) metadata and never invents a missing URL", () => {
  for (const raw of [undefined, null, "", "/docs/module", "//docs.example.test/module", "javascript:alert(1)", "data:text/html,test", "file:///help.html", "https://user:secret@docs.example.test/"]) {
    assert.equal(safeModuleHelpUrl(raw), "");
  }
  const subprogram = mapAgentSchemaToStepRunnerItem({ stepRunnerKey: "sys:subprogram", helpLink: "https://docs.example.test/subprogram" });
  const augmented = augmentStepRunnerItemForSubProgramEdit(subprogram, []);
  assert.equal(moduleHelpLink(augmented), "https://docs.example.test/subprogram");
  assert.equal(safeModuleHelpUrl(" http://docs.example.test/module "), "http://docs.example.test/module");
  assert.equal(withDocsEmbedQuery("https://docs.example.test/module?mode=one&embed=0#parameters"), "https://docs.example.test/module?mode=one&embed=1#parameters");
  assert.equal(withDocsEmbedQuery("javascript:alert(1)"), "");
  const old = mapAgentSchemaToStepRunnerItem({ stepRunnerKey: "sys:openUrl" });
  assert.equal(moduleHelpLink(old), "");
  for (const field of ["helpLink", "HelpLink"]) {
    const current = mapAgentSchemaToStepRunnerItem({ stepRunnerKey: "sys:openUrl", [field]: "https://docs.example.test/module#parameters" });
    assert.equal(moduleHelpLink(current), "https://docs.example.test/module#parameters");
    assert.notEqual(runnerSchemaFingerprint(old), runnerSchemaFingerprint(current), "UI metadata refresh must not discard a new native link");
  }
});
