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

        var result = await session.Rpc.SearchActionSummariesAsync(query, maxResults: 10, ct).ConfigureAwait(false);

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
    public async Task Rpc_SearchStepRunners_returns_catalog_entries()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        // Empty keyword lists catalog head; avoids locale/name drift (e.g. MsgBox vs 消息框).
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
    public async Task Rpc_GetCompressedAction_when_test_action_id_set()
    {
        var actionId = QuickerRpcTestSettings.TestActionId;
        if (string.IsNullOrWhiteSpace(actionId))
        {
            Assert.Inconclusive(
                "Set QUICKER_RPC_TEST_ACTION_ID to a local XAction id to run this test.");
            return;
        }

        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        var result = await session.Rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine("Get action: " + actionId);
        TestContext.WriteLine("Success: " + result.Success);
        if (!string.IsNullOrWhiteSpace(result.ErrorMessage))
        {
            TestContext.WriteLine("Error: " + result.ErrorMessage);
        }

        if (result.Success && !string.IsNullOrWhiteSpace(result.CompressedJson))
        {
            var root = JObject.Parse(result.CompressedJson);
            TestContext.WriteLine("editVersion: " + result.EditVersion);
            TestContext.WriteLine("steps: " + (root["steps"] as JArray)?.Count);
        }

        Assert.IsTrue(result.Success, result.ErrorMessage ?? "GetCompressedActionById failed.");
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.CompressedJson));
        Assert.IsTrue(result.EditVersion > 0);
    }
}
