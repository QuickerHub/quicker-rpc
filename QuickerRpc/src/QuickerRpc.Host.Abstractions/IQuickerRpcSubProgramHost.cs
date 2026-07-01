using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Headless global subprogram read/write.</summary>
public interface IQuickerRpcSubProgramHost
{
    Task<QuickerRpcSubProgramSnapshot?> TryGetAsync(
        string idOrName,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSubProgramWriteResult> TryWriteBodyAsync(
        QuickerRpcSubProgramBodyWrite write,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSubProgramWriteResult> TryCreateAsync(
        QuickerRpcSubProgramCreate create,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcHostMutationResult> TryDeleteAsync(
        string idOrName,
        bool skipConfirm,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
        string idOrName,
        string variableKey,
        string defaultValue,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcApplySubProgramPatchResult> TryApplyPatchAsync(
        string idOrName,
        string patchJson,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionPublishResult> PublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default);
}
