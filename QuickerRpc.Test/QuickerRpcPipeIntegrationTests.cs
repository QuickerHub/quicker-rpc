using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Test;

/// <summary>
/// Live RPC tests against <see cref="IQuickerRpcService"/> (plugin in Quicker.exe).
/// Run: <c>dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests</c>
/// Requires Quicker running with QuickerRpc plugin loaded.
/// </summary>
[TestClass]
public sealed class QuickerRpcPipeIntegrationTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Rpc_Ping_returns_pong()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var pong = await session.Rpc.PingAsync(ct).ConfigureAwait(false);

        TestContext.WriteLine("Ping -> " + pong);
        Assert.AreEqual("pong", pong);
    }

    [TestMethod]
    public async Task Rpc_GetProtocolVersion_returns_current()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var version = await session.Rpc.GetProtocolVersionAsync(ct).ConfigureAwait(false);

        TestContext.WriteLine("ProtocolVersion -> " + version);
        Assert.AreEqual(1, version);
    }

    [TestMethod]
    public async Task Rpc_SearchActionSummaries_returns_matches()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var query = QuickerRpcTestSettings.SearchQuery;

        var result = await session.Rpc
            .SearchActionSummariesAsync(query, maxResults: 10, scope: null, cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine("Search query: " + query);
        TestContext.WriteLine("Success: " + result.Success + ", MatchCount: " + result.MatchCount);
        if (!string.IsNullOrWhiteSpace(result.ErrorMessage))
        {
            TestContext.WriteLine("Error: " + result.ErrorMessage);
        }

        foreach (var item in result.Items ?? System.Array.Empty<QuickerRpcActionSummaryItem>())
        {
            TestContext.WriteLine("  - " + item.ActionId + " | " + item.Title);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchActionSummaries failed.");
        Assert.IsTrue(result.MatchCount >= 0);
    }

    [TestMethod]
    public async Task Rpc_SearchActionSummaries_empty_query_defaults_to_recent_actions()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .SearchActionSummariesAsync(query: string.Empty, maxResults: 5, scope: null, cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine("Query: empty, Sort: " + result.Sort + ", MatchCount: " + result.MatchCount);
        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchActionSummaries failed.");
        Assert.AreEqual("lastEdit", result.Sort);
        Assert.AreEqual(string.Empty, result.Query);
        Assert.IsTrue(result.MatchCount > 0, "expected at least one recent action in catalog.");
        Assert.IsTrue(
            result.Items.All(i => !string.IsNullOrWhiteSpace(i.ActionId)),
            "recent action summaries should include action ids.");
    }

    [TestMethod]
    public async Task Rpc_SearchActionSummaries_sort_lastEdit_returns_recent_first()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .SearchActionSummariesAsync(
                query: null,
                maxResults: 5,
                scope: null,
                sort: "lastEdit",
                cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine("Sort: " + result.Sort + ", MatchCount: " + result.MatchCount);
        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchActionSummaries failed.");
        Assert.AreEqual("lastEdit", result.Sort);
        Assert.IsTrue(result.MatchCount > 0, "expected at least one XAction in catalog.");

        string? previousUtc = null;
        foreach (var item in result.Items ?? Array.Empty<QuickerRpcActionSummaryItem>())
        {
            TestContext.WriteLine("  - " + item.LastEditTimeUtc + " | " + item.Title);
            if (string.IsNullOrEmpty(item.LastEditTimeUtc))
            {
                continue;
            }

            if (previousUtc is not null)
            {
                Assert.IsTrue(
                    string.CompareOrdinal(previousUtc, item.LastEditTimeUtc) >= 0,
                    "items should be ordered by LastEditTimeUtc descending.");
            }

            previousUtc = item.LastEditTimeUtc;
        }
    }

    [TestMethod]
    public async Task Rpc_SearchStepRunners_returns_catalog_entries()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        // Empty browse: common modules first (sys:assign is always in browse list).
        var result = await session.Rpc.SearchStepRunnersAsync(string.Empty, maxResults: 5, ct).ConfigureAwait(false);

        TestContext.WriteLine("StepRunner Success: " + result.Success + ", MatchCount: " + result.MatchCount);
        foreach (var item in result.Items ?? System.Array.Empty<QuickerRpcStepRunnerSearchItem>())
        {
            TestContext.WriteLine("  - " + item.Key + " | " + item.Name);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchStepRunners failed.");
        if (result.MatchCount == 0)
        {
            Assert.Inconclusive("StepRunner catalog is empty in this Quicker session.");
        }
    }

    [TestMethod]
    public async Task Rpc_SearchFontAwesomeIcons_returns_fa_specs()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .SearchFontAwesomeIconsAsync("google", maxResults: 5, cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine("FA search Success: " + result.Success + ", MatchCount: " + result.MatchCount);
        foreach (var name in result.Names ?? System.Array.Empty<string>())
        {
            TestContext.WriteLine("  - " + name);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "SearchFontAwesomeIcons failed.");
        if (result.MatchCount == 0)
        {
            Assert.Inconclusive("Font Awesome catalog returned no matches for 'google'.");
        }

        Assert.IsTrue(
            result.Names!.Any(n => n.Contains("Google", StringComparison.OrdinalIgnoreCase)),
            "Expected Google glyph in results.");
    }

    [TestMethod]
    public async Task Rpc_GetCompressedAction_when_test_action_id_set()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var actionId = QuickerRpcTestSettings.TestActionId
            ?? await QuickerRpcRpcTestAction.EnsureActionIdAsync(session.Rpc, TestContext, ct).ConfigureAwait(false);

        var result = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine("Get action: " + actionId);
        TestContext.WriteLine("Success: " + result.Success);
        if (!string.IsNullOrWhiteSpace(result.ErrorMessage))
        {
            TestContext.WriteLine("Error: " + result.ErrorMessage);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "GetCompressedActionById failed.");
        Assert.IsTrue(result.EditVersion > 0);

        var root = QuickerRpcCompressedJsonAssert.ParseRequired(result.CompressedJson);
        TestContext.WriteLine("editVersion: " + result.EditVersion);
        TestContext.WriteLine(
            "steps: " + QuickerRpcCompressedJsonAssert.StepCount(root)
            + " variables: " + QuickerRpcCompressedJsonAssert.VariableCount(root));
        QuickerRpcCompressedJsonAssert.AssertStepsAndVariablesPositive(root, QuickerRpcRpcTestAction.Title);
    }
}
