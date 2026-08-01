using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class PluginV2CompositionTests
{
    [TestMethod]
    public void AddQuickerRpcPluginV2_registers_rpc_service()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddQuickerRpcPluginV2(new StubV2Host());

        using var provider = services.BuildServiceProvider();
        var rpc = provider.GetRequiredService<IQuickerRpcService>();
        Assert.IsNotNull(rpc);
        Assert.IsInstanceOfType(rpc, typeof(QuickerRpcService));
    }

    [TestMethod]
    public void AddQuickerRpcPluginV2_registers_server_host()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddQuickerRpcPluginV2(new StubV2Host());

        using var provider = services.BuildServiceProvider();
        var hosted = provider.GetServices<IHostedService>();
        Assert.IsTrue(hosted.Any(s => s.GetType().FullName!.Contains("QuickerRpcServerHost")));
    }

    [TestMethod]
    public async Task V2StepRunnerHost_summarize_empty_steps_matches_v1_boundary()
    {
        var host = new V2StepRunnerHost(new V2HeadlessActionProgramService());

        var result = await host.SummarizeStepsAsync([]);

        Assert.IsTrue(result.Success);
        Assert.AreEqual(0, result.Items.Count);
    }

    [TestMethod]
    public async Task V2SearchHost_search_action_library_uses_shared_v1_service_boundary()
    {
        var host = new V2SearchHost(new V2HeadlessCatalogService(), new V2HeadlessActionProgramService());

        var result = await host.SearchActionLibraryAsync(string.Empty);

        Assert.IsFalse(result.Success);
        Assert.AreEqual("keyword is required.", result.ErrorMessage);
    }

    [TestMethod]
    public async Task V2ExpressionHost_check_expression_uses_shared_v1_service_boundary()
    {
        var host = new V2ExpressionHost();

        var result = await host.CheckExpressionAsync(string.Empty);

        Assert.IsFalse(result.Success);
        Assert.AreEqual("EMPTY_CODE", result.ErrorCode);
    }

    [TestMethod]
    public async Task V2ExpressionHost_execute_expression_uses_shared_v1_service_boundary()
    {
        var host = new V2ExpressionHost();

        var result = await host.ExecuteExpressionAsync(string.Empty);

        Assert.IsFalse(result.Success);
        Assert.AreEqual("EMPTY_CODE", result.ErrorCode);
    }

    [TestMethod]
    public async Task V2ExpressionHost_executes_qkeval_and_writes_variables_back()
    {
        var host = new V2ExpressionHost();

        var result = await host.ExecuteExpressionAsync(
            "{count} = {count} + 2; return {count};",
            "{\"count\":3}");

        Assert.IsTrue(result.Success, result.Message);
        Assert.AreEqual("5", result.ResultJson);
        Assert.AreEqual(5L, JObject.Parse(result.VariablesJson!)["count"]?.Value<long>());
    }

    [TestMethod]
    public async Task V2ExpressionHost_reports_qkeval_syntax_diagnostics()
    {
        var host = new V2ExpressionHost();

        var result = await host.CheckExpressionAsync("1 +");

        Assert.IsFalse(result.Success);
        Assert.AreEqual("COMPILE_ERROR", result.ErrorCode);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.Message));
    }

    [TestMethod]
    public async Task V2LauncherHost_ranks_action_and_subprogram_catalog_results()
    {
        var host = new V2LauncherHost(new StubSearchHost());

        var result = await host.ResolveIntentAsync("clipboard", maxResults: 10);

        Assert.IsTrue(result.Ok, result.Message);
        Assert.AreEqual(2, result.Candidates.Count);
        Assert.AreEqual("action", result.Candidates[0].Kind);
        Assert.AreEqual("action-1", result.Candidates[0].ActionId);
        Assert.AreEqual("subprogram", result.Candidates[1].Kind);
        Assert.AreEqual("sub-1", result.Candidates[1].SubProgramId);
        Assert.AreEqual(0, result.MissedTerms.Count);
    }

    [TestMethod]
    public async Task V2ActionRunHost_run_uses_shared_v1_service_boundary()
    {
        var host = new V2ActionRunHost();

        var result = await host.RunAsync("missing-action-id");

        Assert.IsFalse(result.Ok);
        Assert.IsTrue(
            (result.Message ?? string.Empty).Contains("Not running inside Quicker", StringComparison.OrdinalIgnoreCase)
            || (result.Message ?? string.Empty).Contains("unavailable", StringComparison.OrdinalIgnoreCase),
            result.Message);
    }

    [TestMethod]
    public async Task V2ActionRunHost_trace_outside_quicker_fails_gracefully()
    {
        var host = new V2ActionRunHost();

        var result = await host.RunTraceAsync("missing-action-id");

        Assert.IsFalse(result.Ok);
        Assert.IsTrue(
            (result.Message ?? string.Empty).Contains("Not running inside Quicker", StringComparison.OrdinalIgnoreCase)
            || (result.Message ?? string.Empty).Contains("unavailable", StringComparison.OrdinalIgnoreCase)
            || (result.Message ?? string.Empty).Contains("not found", StringComparison.OrdinalIgnoreCase),
            result.Message);
    }

    [TestMethod]
    public async Task V2ActionCatalogHost_create_outside_quicker_fails_gracefully()
    {
        var host = new V2ActionCatalogHost();

        var result = await host.CreateActionAsync("New action");

        Assert.IsFalse(result.Ok);
        StringAssert.Contains(result.Message, "Not running inside Quicker");
    }

    [TestMethod]
    public async Task V2ActionCatalogHost_delete_outside_quicker_fails_gracefully()
    {
        var host = new V2ActionCatalogHost();

        var result = await host.DeleteActionAsync(Guid.NewGuid().ToString("D"));

        Assert.IsFalse(result.Ok);
        StringAssert.Contains(result.Message, "unavailable");
    }

    [TestMethod]
    public async Task V2ActionDocHost_rejects_non_guid_without_network_access()
    {
        var host = new V2ActionDocHost();

        var result = await host.GetDetailHtmlAsync("not-a-shared-action-id");

        Assert.IsFalse(result.Ok);
        StringAssert.Contains(result.Message, "sharedActionId GUID");
    }

    [TestMethod]
    public async Task V2ActionDocHost_reports_missing_quicker_session()
    {
        var host = new V2ActionDocHost();

        var result = await host.PrepareWebSessionAsync(Guid.NewGuid().ToString("D"));

        Assert.IsFalse(result.Ok);
        StringAssert.Contains(result.Message, "Not running inside Quicker");
    }

    [TestMethod]
    public async Task V2SubProgramHost_delete_requires_explicit_confirmation()
    {
        var actionPrograms = new V2HeadlessActionProgramService();
        var host = new V2SubProgramHost(new V2HeadlessSubProgramService(actionPrograms));

        var result = await host.TryDeleteAsync("subprogram", skipConfirm: false);

        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.Message, "skipConfirm=true");
    }

    [TestMethod]
    public async Task V2SettingsHost_exposes_v2_catalog_without_quicker_runtime()
    {
        var host = new V2SettingsHost();

        var result = await host.ListAsync("userSettings", maxResults: 20);

        Assert.IsTrue(result.Ok, result.Message);
        Assert.IsTrue(result.Items.Count > 0, "Expected UserSettings2 catalog entries.");
        Assert.IsTrue(result.Items.All(item => item.Key.StartsWith("userSettings:", StringComparison.Ordinal)));
    }

    [TestMethod]
    public async Task V2SettingsHost_get_outside_quicker_fails_gracefully()
    {
        var host = new V2SettingsHost();

        var result = await host.GetAsync("userSettings:EnableCircleMenu");

        Assert.IsFalse(result.Ok);
        StringAssert.Contains(result.Message, "Not running inside Quicker");
    }

    [TestMethod]
    public void V2ActionPatchCore_returns_v1_style_patch_result_payloads()
    {
        var body = JObject.Parse(
            """
            {
              "steps": [
                { "stepId": "s1", "stepRunnerKey": "sys:assign", "inputParams": { "expression": { "value": "1" } } }
              ],
              "variables": [
                { "id": "v1", "key": "a", "defaultValue": "1" }
              ],
              "subPrograms": []
            }
            """);
        var patch = JObject.Parse(
            """
            {
              "title": "Patched title",
              "steps": [
                { "op": "update", "stepId": "s1", "inputParams": { "expression": "2" } },
                { "op": "add", "stepRunnerKey": "sys:assign", "inputParams": { "expression": "3" } }
              ],
              "variables": [
                { "op": "update", "key": "a", "defaultValue": "2" },
                { "op": "add", "key": "b", "defaultValue": "3" }
              ]
            }
            """);

        var result = V2ActionPatchCore.Apply(body, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.IsTrue(result.PresentationUpdated);
        Assert.AreEqual("s1", JArray.Parse(result.UpdatedStepsJson!)[0]["stepId"]?.ToString());
        Assert.AreEqual("sys:assign", JArray.Parse(result.AddedStepsJson!)[0]["stepRunnerKey"]?.ToString());
        Assert.AreEqual("a", JArray.Parse(result.UpdatedVariablesJson!)[0]["key"]?.ToString());
        Assert.AreEqual("b", JArray.Parse(result.AddedVariablesJson!)[0]["key"]?.ToString());
        Assert.AreEqual("Patched title", result.Metadata.Title);
    }

    private sealed class StubV2Host : IQuickerRpcHost
    {
        public QuickerRpcHostInfo Info { get; } = new()
        {
            Kind = QuickerHostKind.V2,
            QuickerVersion = "test",
            AdapterAssembly = "Quicker.Infrastructure.Test",
        };

        public IQuickerRpcHostCapabilities Capabilities { get; } = new StubV2Capabilities();

        public IQuickerRpcSessionHost Session => throw new NotImplementedException();

        public IQuickerRpcActionProgramHost ActionPrograms => throw new NotImplementedException();

        public IQuickerRpcActionSharingHost ActionSharing => throw new NotImplementedException();

        public IQuickerRpcSubProgramHost SubPrograms => throw new NotImplementedException();

        public IQuickerRpcActionRunHost ActionRuns => throw new NotImplementedException();

        public IQuickerRpcActionCatalogHost ActionCatalog => throw new NotImplementedException();

        public IQuickerRpcSearchHost Search => throw new NotImplementedException();

        public IQuickerRpcSettingsHost Settings => throw new NotImplementedException();

        public IQuickerRpcActionDocHost ActionDocs => throw new NotImplementedException();

        public IQuickerRpcStepRunnerHost StepRunners => throw new NotImplementedException();

        public IQuickerRpcExpressionHost Expressions => throw new NotImplementedException();

        public IQuickerRpcChromeControlHost? ChromeControl => null;

        public IQuickerRpcTriggerHost? Triggers => null;

        public IQuickerRpcDesignerHost? Designer => null;

        public IQuickerRpcLauncherHost? Launcher => null;
    }

    private sealed class StubSearchHost : IQuickerRpcSearchHost
    {
        public Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
            string? query,
            int maxResults = 30,
            string? scope = null,
            string? sort = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new QuickerRpcSearchActionSummariesResult
            {
                Success = true,
                Items =
                [
                    new QuickerRpcActionSummaryItem
                    {
                        ActionId = "action-1",
                        Title = "Clipboard history",
                        Description = "Search clipboard entries",
                        Score = 120,
                    },
                ],
            });

        public Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
            string query,
            int maxCount = 20,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new QuickerRpcSubProgramSearchResult
            {
                Ok = true,
                Items =
                [
                    new QuickerRpcSubProgramSummary
                    {
                        Id = "sub-1",
                        Name = "Clipboard normalize",
                        Description = "Normalize clipboard text",
                        Score = 80,
                    },
                ],
            });

        public Task<QuickerRpcActionSearchResult> SearchActionsAsync(
            string query,
            int maxCount = 20,
            string? scope = null,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
            string? query,
            int maxCount = 30,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
            string keyword,
            int page = 1,
            int? days = null,
            int maxResults = 20,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
            string? region = null,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class StubV2Capabilities : IQuickerRpcHostCapabilities
    {
        public bool ChromeControl => false;

        public bool Triggers => false;

        public bool DesignerUi => false;

        public bool Launcher => false;

        public bool EnforcesDesignerOpenGuard => false;
    }
}
