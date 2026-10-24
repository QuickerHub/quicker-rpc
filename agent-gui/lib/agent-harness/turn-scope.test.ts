import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import type { DesignerContextSnapshot } from "../designer-context-types";
import type { ResolvedAgentTurnRequest } from "./turn-request.server";

test("production turn scope preserves local Ask context without requesting live Designer state", async () => {
  const parent = fileURLToPath(new URL("../../../.tmp/ask-turn-scope/", import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(join(parent, "fixture-"));
  const keys = ["QUICKER_AGENT_DATA_DIR", "AGENT_GUI_ROOT", "AGENT_GUI_DEFAULT_CWD", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME"];
  const previous = keys.map((key) => process.env[key]);
  for (const key of keys) process.env[key] = root;
  let remoteCalls = 0, spawns = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { remoteCalls++; throw Error("No remote transport belongs to this fixture"); };
  const spawn = mock.method(childProcess, "spawn", () => { spawns++; throw Error("No child belongs to this fixture"); });
  syncBuiltinESMExports();
  try {
    // Load the actual pre-turn path with generated profile/resource roots. No
    // production model, database, configuration, or remote endpoint is invoked.
    const { resolveAgentTurnScope } = await import("./turn-runtime.server");
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const messages: ResolvedAgentTurnRequest["messagesForModel"] = [{
      id: "scope-user", role: "user", parts: [{ type: "text", text: `<qka id="${id}">Local mention</qka> explain` }],
    }];
    const request: ResolvedAgentTurnRequest = {
      body: { messages, designerEmbedScoped: true }, chatMode: "ask", cwd: root,
      repairedMessages: messages, messagesForModel: messages,
      titleTest: false, benchMode: true, enabledToolIds: [],
      slashCommand: { expandedUserText: null, overrides: {}, commandName: null },
      selection: { kind: "profile", profileId: "fixture", modelId: "fixture" },
      lastUserText: "explain", threadId: "scope-fixture",
      actionDesigner: { entityId: id, isSubProgram: false },
    };
    let designerReads = 0;
    const read = async (includeXAction = false): Promise<DesignerContextSnapshot> => {
      designerReads++;
      assert.equal(includeXAction, false);
      return { ok: true, designers: [{ entityId: id, isSubProgram: false, title: "Remote title", selectedSteps: [{ index: 0, stepId: "remote-step", note: "Remote selection" }] }] };
    };

    const ask = await resolveAgentTurnScope(request, undefined, undefined, read);
    assert.equal(designerReads, 0);
    assert.equal(ask.actionScope.pinnedLatest?.title, "Local mention");
    assert.match(ask.designerEmbedBlock ?? "", /当前标题与选中步骤不可用/);
    assert.equal(ask.designerEmbedBlock?.includes("Remote title"), false);
    assert.equal(ask.designerEmbedBlock?.includes("remote-step"), false);
    assert.equal(ask.toolExecutionContext.chatMode, "ask");
    assert.equal(ask.toolExecutionContext.cwd, root);

    const embeddedOnly = await resolveAgentTurnScope({ ...request, messagesForModel: [] }, undefined, undefined, read);
    assert.equal(embeddedOnly.actionScope.pinnedLatest?.id, id);
    assert.equal(embeddedOnly.actionScope.pinnedLatest?.title, undefined);
    const plainAsk = await resolveAgentTurnScope({ ...request, actionDesigner: undefined }, undefined, undefined, read);
    assert.equal(plainAsk.designerEmbedBlock, undefined);
    assert.equal(plainAsk.actionScope.pinnedLatest?.title, "Local mention");
    assert.equal(designerReads, 0);

    const agent = await resolveAgentTurnScope({ ...request, chatMode: "agent" }, undefined, undefined, read);
    assert.equal(designerReads, 1);
    assert.match(agent.designerEmbedBlock ?? "", /Remote title/);
    assert.match(agent.designerEmbedBlock ?? "", /Remote selection/);
    const launcher = await resolveAgentTurnScope({ ...request, chatMode: "launcher" }, undefined, undefined, read);
    assert.equal(designerReads, 1);
    assert.equal(launcher.designerEmbedBlock, undefined);

    const reason = Error("cancel before scope");
    const controller = new AbortController(); controller.abort(reason);
    await assert.rejects(resolveAgentTurnScope(request, controller.signal, undefined, read), (error) => error === reason);
    assert.equal(designerReads, 1);
    assert.equal(remoteCalls, 0);
    assert.equal(spawns, 0);
    assert.deepEqual(await fs.readdir(root), []);
  } finally {
    spawn.mock.restore(); syncBuiltinESMExports(); globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    assert.ok(relative(parent, root).startsWith("fixture-"));
    await fs.rm(root, { recursive: true, force: true });
  }
});
