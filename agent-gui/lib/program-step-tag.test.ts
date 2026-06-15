import assert from "node:assert/strict";
import { test } from "node:test";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import {
  createProgramStepTag,
  formatProgramStepTagMarkup,
  programStepTagFromAttrs,
} from "@/lib/program-step-tag";
import { parseHtmlAttrs } from "@/lib/qka-markup";

test("program step tag markup round-trips content and expands for model", () => {
  const tag = createProgramStepTag({
    programTarget: "action",
    programId: "655a4ed4-37cb-41e9-bb75-782ca07d45a3",
    dataJsonPath:
      ".quicker/actions/655a4ed4-37cb-41e9-bb75-782ca07d45a3/data.json",
    nodePath: "1",
    stepRunnerKey: "sys:MsgBox",
    note: "弹窗显示过滤后的键列表",
    content: '{\n  "stepRunnerKey": "sys:MsgBox"\n}',
    startLine: 10,
    endLine: 20,
    designerStepId: "s-2",
  });
  const markup = formatProgramStepTagMarkup(tag);
  const match = markup.match(/<qkrpc-program-step\s+([^>]*?)><\/qkrpc-program-step>/);
  assert.ok(match);
  const parsed = programStepTagFromAttrs(parseHtmlAttrs(match![1]!));
  assert.ok(parsed);
  assert.equal(parsed!.content, tag.content);
  assert.equal(parsed!.nodePath, "1");
  assert.equal(parsed!.contentHash, tag.contentHash);

  const expanded = expandUserMessageForModel(`请修改 ${markup} 的标题`);
  assert.match(expanded, /workspace_program edit_data/);
  assert.match(expanded, /node-path="1"/);
  assert.match(expanded, /sys:MsgBox/);
});
