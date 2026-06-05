using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Test;

/// <summary>
/// Live RPC tests that assert non-empty payloads (requires Quicker + QuickerRpc plugin).
/// </summary>
[TestClass]
public sealed class QuickerRpcRpcContentTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Rpc_SearchActionSummaries_finds_QuickerRpc()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var query = QuickerRpcTestSettings.SearchQuery;

        var result = await session.Rpc
            .SearchActionSummariesAsync(query, maxResults: 20, scope: null, cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine($"SearchActionSummaries query={query} success={result.Success} count={result.MatchCount}");
        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchActionSummaries failed.");
        Assert.IsTrue(result.MatchCount > 0, "Expected at least one action summary.");
        Assert.IsTrue(
            result.Items.Any(i =>
                (i.Title?.IndexOf("QuickerRpc", System.StringComparison.OrdinalIgnoreCase) ?? -1) >= 0
                || (i.ActionId?.IndexOf("f5c76108", System.StringComparison.OrdinalIgnoreCase) ?? -1) >= 0),
            "Expected QuickerRpc in search results.");
    }

    [TestMethod]
    public async Task Rpc_GetStepRunnerDetail_sys_MsgBox_has_inputs()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var key = QuickerRpcTestSettings.StepRunnerKey;

        var result = await session.Rpc.GetStepRunnerDetailAsync(key, cancellationToken: ct).ConfigureAwait(false);

        TestContext.WriteLine($"GetStepRunnerDetail key={key} success={result.Success}");
        Assert.IsTrue(result.Success, result.ErrorMessage ?? "GetStepRunnerDetail failed.");
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.SchemaJson), "SchemaJson is empty.");
        Assert.IsTrue(
            result.SchemaJson.IndexOf("\"inputs\"", System.StringComparison.Ordinal) >= 0,
            "SchemaJson should contain inputs array.");
    }

    [TestMethod]
    public async Task Rpc_SearchStepRunners_window_move_ex_sets_control_field()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .SearchStepRunnersAsync("移动窗口增强", maxResults: 10, cancellationToken: ct)
            .ConfigureAwait(false);

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchStepRunners failed.");
        var hit = result.Items.FirstOrDefault(i => i.Key == "sys:windowOperations");
        Assert.IsNotNull(hit, "Expected sys:windowOperations in search results.");
        Assert.IsNotNull(hit!.ControlField);
        Assert.AreEqual("type", hit.ControlField.Key);
        Assert.AreEqual("move_ex", hit.ControlField.Value);
    }

    [TestMethod]
    public async Task Rpc_GetStepRunnerDetail_windowOperations_filters_by_control_field()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var moveEx = await session.Rpc
            .GetStepRunnerDetailAsync("sys:windowOperations", "move_ex", ct)
            .ConfigureAwait(false);
        var move = await session.Rpc
            .GetStepRunnerDetailAsync("sys:windowOperations", "move", ct)
            .ConfigureAwait(false);

        Assert.IsTrue(moveEx.Success, moveEx.ErrorMessage);
        Assert.IsTrue(move.Success, move.ErrorMessage);

        var moveExKeys = ExtractInputKeys(moveEx.SchemaJson!);
        var moveKeys = ExtractInputKeys(move.SchemaJson!);

        TestContext.WriteLine("move_ex keys: " + string.Join(", ", moveExKeys));
        TestContext.WriteLine("move keys: " + string.Join(", ", moveKeys));

        CollectionAssert.Contains(moveExKeys, "area");
        CollectionAssert.DoesNotContain(moveExKeys, "x");
        CollectionAssert.Contains(moveKeys, "x");
        CollectionAssert.DoesNotContain(moveKeys, "area");
        Assert.IsFalse(
            moveEx.SchemaJson!.IndexOf("\"visibilityFilteringAvailable\":true", System.StringComparison.OrdinalIgnoreCase) >= 0,
            "True visibilityFilteringAvailable should be omitted.");
    }

    private static System.Collections.Generic.List<string> ExtractInputKeys(string schemaJson)
    {
        using var doc = System.Text.Json.JsonDocument.Parse(schemaJson);
        var list = new System.Collections.Generic.List<string>();
        if (!doc.RootElement.TryGetProperty("inputs", out var inputs)
            && !doc.RootElement.TryGetProperty("Inputs", out inputs))
        {
            return list;
        }

        foreach (var item in inputs.EnumerateArray())
        {
            if (item.TryGetProperty("key", out var key)
                || item.TryGetProperty("Key", out key))
            {
                list.Add(key.GetString() ?? string.Empty);
            }
        }

        return list;
    }

    [TestMethod]
    public async Task Rpc_GetCompressedAction_rpc_test_fixture_has_steps_and_variables()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var actionId = await QuickerRpcRpcTestAction
            .EnsureActionIdAsync(session.Rpc, TestContext, ct)
            .ConfigureAwait(false);

        var result = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine($"rpc_test get actionId={actionId} success={result.Success}");
        Assert.IsTrue(result.Success, result.ErrorMessage ?? "GetCompressedActionById failed.");

        var root = QuickerRpcCompressedJsonAssert.ParseRequired(result.CompressedJson);
        TestContext.WriteLine(
            $"rpc_test steps={QuickerRpcCompressedJsonAssert.StepCount(root)} variables={QuickerRpcCompressedJsonAssert.VariableCount(root)}");
        QuickerRpcCompressedJsonAssert.AssertStepsAndVariablesPositive(root, QuickerRpcRpcTestAction.Title);
    }

    [TestMethod]
    public async Task Rpc_GetCompressedAction_local_when_test_action_id_set()
    {
        var actionId = QuickerRpcTestSettings.TestActionId;
        if (actionId is null)
        {
            Assert.Inconclusive("Set QUICKER_RPC_TEST_ACTION_ID to a local XAction with steps.");
            return;
        }

        await AssertActionHasProgramAsync(actionId, requireSteps: true, label: "local");
    }

    [TestMethod]
    public async Task Rpc_GetCompressedAction_shared_QuickerRpc_has_steps()
    {
        var actionId = QuickerRpcTestSettings.SharedActionId;
        if (actionId is null)
        {
            Assert.Inconclusive("Set QUICKER_RPC_TEST_SHARED_ACTION_ID.");
            return;
        }

        await AssertActionHasProgramAsync(actionId, requireSteps: true, label: "shared");
    }

    /// <summary>
    /// Headless get must hydrate program from <c>TemplateId</c> (UseTemplate / empty <c>Data</c>),
    /// not only when the action designer is open.
    /// </summary>
    [TestMethod]
    public async Task Rpc_GetCompressedAction_clipboard_n10_has_steps_without_designer()
    {
        var actionId = QuickerRpcTestSettings.ClipboardN10ActionId;
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var summaries = await session.Rpc
            .SearchActionSummariesAsync("剪贴板n10", maxResults: 30, scope: null, cancellationToken: ct)
            .ConfigureAwait(false);
        if (!summaries.Success
            || summaries.Items.All(i =>
                !string.Equals(i.ActionId, actionId, System.StringComparison.OrdinalIgnoreCase)))
        {
            Assert.Inconclusive(
                $"Action '{QuickerRpcTestSettings.ClipboardN10ActionTitle}' ({actionId}) not found in this Quicker profile. " +
                "Install it or set QUICKER_RPC_TEST_CLIPBOARD_N10_ACTION_ID.");
        }

        var result = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine(
            $"clipboard_n10 get actionId={actionId} success={result.Success} error={result.ErrorMessage}");
        Assert.IsTrue(
            result.Success,
            result.ErrorMessage
            ?? "GetCompressedActionById failed; reload QuickerRpc plugin (pwsh ./build.ps1 -t) so TemplateId hydration is active.");

        var root = QuickerRpcCompressedJsonAssert.ParseRequired(result.CompressedJson);
        var steps = QuickerRpcCompressedJsonAssert.StepCount(root);
        var variables = QuickerRpcCompressedJsonAssert.VariableCount(root);
        TestContext.WriteLine($"clipboard_n10 steps={steps} variables={variables}");

        Assert.IsTrue(
            steps > 0,
            "clipboard n10: expected steps > 0 from shared-action hydration (TemplateId), not empty in-profile Data.");
        QuickerRpcCompressedJsonAssert.AssertHasProgramContent(root, QuickerRpcTestSettings.ClipboardN10ActionTitle);
    }

    [TestMethod]
    public async Task Rpc_GetCompressedAction_return_modes_structure_and_metadata()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ctSetup = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var actionId = QuickerRpcTestSettings.TestActionId
            ?? await QuickerRpcRpcTestAction.EnsureActionIdAsync(session.Rpc, TestContext, ctSetup).ConfigureAwait(false);

        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var structure = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "structure", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(structure.Success, structure.ErrorMessage);
        var structureRoot = QuickerRpcCompressedJsonAssert.ParseRequired(structure.CompressedJson);
        if (QuickerRpcCompressedJsonAssert.StepCount(structureRoot) == 0
            && QuickerRpcCompressedJsonAssert.VariableCount(structureRoot) == 0)
        {
            Assert.Inconclusive("structure mode empty; reload QuickerRpc plugin (build.ps1 -t).");
        }

        var metadata = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(metadata.Success, metadata.ErrorMessage);
        var metadataRoot = QuickerRpcCompressedJsonAssert.ParseRequired(metadata.CompressedJson);
        Assert.IsTrue(
            QuickerRpcCompressedJsonAssert.MetadataStepCount(metadataRoot) > 0
            || !string.IsNullOrWhiteSpace(metadataRoot["title"]?.ToString()),
            "metadata should include stepCount or title.");
    }

    [TestMethod]
    public async Task Rpc_UpdateActionMetadata_sets_and_restores_icon()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ctSetup = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var actionId = QuickerRpcTestSettings.TestActionId
            ?? await QuickerRpcRpcTestAction.EnsureActionIdAsync(session.Rpc, TestContext, ctSetup).ConfigureAwait(false);

        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var before = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(before.Success, before.ErrorMessage);
        var beforeRoot = QuickerRpcCompressedJsonAssert.ParseRequired(before.CompressedJson);
        var originalIcon = beforeRoot["icon"]?.ToString() ?? string.Empty;
        var editVersion = before.EditVersion;

        const string testIcon = "fa:Light_Flask";
        var updated = await session.Rpc
            .UpdateActionMetadataAsync(
                actionId,
                title: null,
                description: null,
                icon: testIcon,
                expectedEditVersion: editVersion,
                force: false,
                cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(updated.Success, updated.ErrorMessage ?? "UpdateActionMetadata failed.");
        Assert.AreEqual(testIcon, updated.Icon);

        var after = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(after.Success, after.ErrorMessage);
        var afterRoot = QuickerRpcCompressedJsonAssert.ParseRequired(after.CompressedJson);
        Assert.AreEqual(testIcon, afterRoot["icon"]?.ToString());

        var restored = await session.Rpc
            .UpdateActionMetadataAsync(
                actionId,
                title: null,
                description: null,
                icon: originalIcon,
                expectedEditVersion: after.EditVersion,
                force: false,
                cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(restored.Success, restored.ErrorMessage ?? "Restore icon failed.");
    }

    [TestMethod]
    public async Task Rpc_UpdateActionMetadata_sets_and_restores_context_menu()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ctSetup = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var actionId = QuickerRpcTestSettings.TestActionId
            ?? await QuickerRpcRpcTestAction.EnsureActionIdAsync(session.Rpc, TestContext, ctSetup).ConfigureAwait(false);

        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var before = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(before.Success, before.ErrorMessage);
        var beforeRoot = QuickerRpcCompressedJsonAssert.ParseRequired(before.CompressedJson);
        var originalMenu = beforeRoot["contextMenuData"]?.ToString() ?? string.Empty;
        var stepCountBefore = QuickerRpcCompressedJsonAssert.MetadataStepCount(beforeRoot);
        var editVersion = before.EditVersion;

        const string testMenu = "[fa:Light_Cog]设置|settings";
        var updated = await session.Rpc
            .UpdateActionMetadataAsync(
                actionId,
                title: null,
                description: null,
                icon: null,
                contextMenuData: testMenu,
                expectedEditVersion: editVersion,
                force: false,
                cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(updated.Success, updated.ErrorMessage ?? "UpdateActionMetadata failed.");
        Assert.AreEqual(testMenu, updated.ContextMenuData);

        var after = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(after.Success, after.ErrorMessage);
        var afterRoot = QuickerRpcCompressedJsonAssert.ParseRequired(after.CompressedJson);
        Assert.AreEqual(testMenu, afterRoot["contextMenuData"]?.ToString());
        Assert.AreEqual(
            stepCountBefore,
            QuickerRpcCompressedJsonAssert.MetadataStepCount(afterRoot),
            "set-metadata contextMenuData must not change program steps.");

        var restored = await session.Rpc
            .UpdateActionMetadataAsync(
                actionId,
                title: null,
                description: null,
                icon: null,
                contextMenuData: originalMenu,
                expectedEditVersion: after.EditVersion,
                force: false,
                cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(restored.Success, restored.ErrorMessage ?? "Restore context menu failed.");
    }

    [TestMethod]
    public async Task Rpc_ActionPatch_updates_and_restores_context_menu()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ctSetup = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var actionId = QuickerRpcTestSettings.TestActionId
            ?? await QuickerRpcRpcTestAction.EnsureActionIdAsync(session.Rpc, TestContext, ctSetup).ConfigureAwait(false);

        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var before = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(before.Success, before.ErrorMessage);
        var beforeRoot = QuickerRpcCompressedJsonAssert.ParseRequired(before.CompressedJson);
        var originalMenu = beforeRoot["contextMenuData"]?.ToString() ?? string.Empty;
        var stepCountBefore = QuickerRpcCompressedJsonAssert.MetadataStepCount(beforeRoot);
        var editVersion = before.EditVersion;

        const string patchMenu = "快速|quick\r\n重置|reset";
        var patchJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { contextMenuData = patchMenu });
        var patched = await session.Rpc
            .ApplyActionPatchToActionAsync(
                actionId,
                patchJson,
                expectedEditVersion: editVersion,
                force: false,
                cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(patched.Success, patched.ErrorMessage ?? "ApplyActionPatch failed.");
        Assert.IsTrue(patched.PresentationUpdated == true, "Expected presentationUpdated for contextMenuData patch.");

        var after = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(after.Success, after.ErrorMessage);
        var afterRoot = QuickerRpcCompressedJsonAssert.ParseRequired(after.CompressedJson);
        Assert.AreEqual(patchMenu, afterRoot["contextMenuData"]?.ToString());
        Assert.AreEqual(
            stepCountBefore,
            QuickerRpcCompressedJsonAssert.MetadataStepCount(afterRoot),
            "Patching contextMenuData must not change program steps.");

        var restoreJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { contextMenuData = originalMenu });
        var restored = await session.Rpc
            .ApplyActionPatchToActionAsync(
                actionId,
                restoreJson,
                expectedEditVersion: after.EditVersion,
                force: false,
                cancellationToken: ct)
            .ConfigureAwait(false);
        Assert.IsTrue(restored.Success, restored.ErrorMessage ?? "Restore context menu patch failed.");
        Assert.AreEqual(originalMenu, QuickerRpcCompressedJsonAssert.ParseRequired(
            (await session.Rpc.GetCompressedActionByIdAsync(actionId, returnMode: "metadata", cancellationToken: ct)
                .ConfigureAwait(false)).CompressedJson)["contextMenuData"]?.ToString());
    }

    [TestMethod]
    public async Task Rpc_ListGlobalSubPrograms_returns_entries()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc.ListGlobalSubProgramsAsync(query: null, maxCount: 10, ct).ConfigureAwait(false);

        TestContext.WriteLine($"ListGlobalSubPrograms ok={result.Ok} count={result.Items?.Count ?? 0}");
        Assert.IsTrue(result.Ok, result.Message ?? "ListGlobalSubPrograms failed.");
        if (result.Items is null || result.Items.Count == 0)
        {
            Assert.Inconclusive("No global subprograms in this Quicker profile.");
        }
    }

    [TestMethod]
    public async Task Rpc_GetCompressedSubProgram_when_test_id_set()
    {
        var id = QuickerRpcTestSettings.SubProgramIdOrName;
        if (id is null)
        {
            Assert.Inconclusive("Set QUICKER_RPC_TEST_SUBPROGRAM to a global subprogram id or name.");
            return;
        }

        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .GetCompressedSubProgramAsync(id, returnMode: "structure", cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine($"GetCompressedSubProgram id={id} success={result.Success}");
        Assert.IsTrue(result.Success, result.ErrorMessage ?? "GetCompressedSubProgram failed.");
        var root = QuickerRpcCompressedJsonAssert.ParseRequired(result.CompressedJson);
        QuickerRpcCompressedJsonAssert.AssertHasProgramContent(root, "subprogram structure");
    }

    private async Task AssertActionHasProgramAsync(string actionId, bool requireSteps, string label)
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine($"{label} get actionId={actionId} success={result.Success}");
        if (!string.IsNullOrWhiteSpace(result.ErrorMessage))
        {
            TestContext.WriteLine("Error: " + result.ErrorMessage);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "GetCompressedActionById failed.");
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.CompressedJson));
        Assert.IsTrue(result.EditVersion > 0, "editVersion should be positive.");

        var root = QuickerRpcCompressedJsonAssert.ParseRequired(result.CompressedJson);
        TestContext.WriteLine($"{label} steps={QuickerRpcCompressedJsonAssert.StepCount(root)} variables={QuickerRpcCompressedJsonAssert.VariableCount(root)}");

        if (!requireSteps)
        {
            return;
        }

        if (QuickerRpcCompressedJsonAssert.StepCount(root) == 0
            && QuickerRpcCompressedJsonAssert.VariableCount(root) == 0)
        {
            Assert.Inconclusive(
                $"{label}: compressed JSON has no steps/variables. Reload QuickerRpc plugin in Quicker " +
                "(pwsh ./build.ps1 -t), then retry. Override id with QUICKER_RPC_TEST_SHARED_ACTION_ID.");
        }

        QuickerRpcCompressedJsonAssert.AssertHasProgramContent(root, label);
    }
}
