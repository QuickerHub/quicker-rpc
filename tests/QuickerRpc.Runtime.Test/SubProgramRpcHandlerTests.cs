using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Host;
using QuickerRpc.Runtime;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class SubProgramRpcHandlerTests
{
    [TestMethod]
    public async Task GetCompressedSubProgramAsync_requires_id()
    {
        var handler = CreateHandler();
        var host = new StubSubProgramHost();

        var result = await handler.GetCompressedSubProgramAsync(host, "  ", "structure", CancellationToken.None);

        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.ErrorMessage, "required");
    }

    [TestMethod]
    public async Task GetCompressedSubProgramAsync_compresses_snapshot()
    {
        var handler = CreateHandler();
        var host = new StubSubProgramHost
        {
            Snapshot = new QuickerRpcSubProgramSnapshot
            {
                Id = "sub-guid",
                Name = "MySub",
                CallIdentifier = "MySub",
                EditVersion = 42,
                BodyJson = """{"steps":[],"variables":[]}""",
            },
        };

        var result = await handler.GetCompressedSubProgramAsync(host, "MySub", "structure", CancellationToken.None);

        Assert.IsTrue(result.Success);
        Assert.AreEqual("sub-guid", result.SubProgramId);
        Assert.AreEqual("MySub", result.Name);
        Assert.AreEqual(42L, result.EditVersion);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.CompressedJson));
        StringAssert.Contains(result.CompressedJson, "\"subProgramId\"");
    }

    private static SubProgramRpcHandler CreateHandler() =>
        new(new QuickerRpcRuntimeDependencies(() => new StepRunnerCatalog(), "test-catalog"));

    private sealed class StubSubProgramHost : IQuickerRpcSubProgramHost
    {
        public QuickerRpcSubProgramSnapshot? Snapshot { get; set; }

        public Task<QuickerRpcSubProgramSnapshot?> TryGetAsync(
            string idOrName,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Snapshot);

        public Task<QuickerRpcSubProgramWriteResult> TryWriteBodyAsync(
            QuickerRpcSubProgramBodyWrite write,
            CancellationToken cancellationToken = default) =>
            throw new System.NotImplementedException();

        public Task<QuickerRpcSubProgramWriteResult> TryCreateAsync(
            QuickerRpcSubProgramCreate create,
            CancellationToken cancellationToken = default) =>
            throw new System.NotImplementedException();

        public Task<QuickerRpcHostMutationResult> TryDeleteAsync(
            string idOrName,
            bool skipConfirm,
            CancellationToken cancellationToken = default) =>
            throw new System.NotImplementedException();

        public Task<QuickerRpc.Contracts.Rpc.QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
            string idOrName,
            string variableKey,
            string defaultValue,
            CancellationToken cancellationToken = default) =>
            throw new System.NotImplementedException();

        public Task<QuickerRpc.Contracts.Rpc.QuickerRpcApplySubProgramPatchResult> TryApplyPatchAsync(
            string idOrName,
            string patchJson,
            long? expectedEditVersion,
            bool force,
            CancellationToken cancellationToken = default) =>
            throw new System.NotImplementedException();
    }
}
