using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Local action catalog: create, delete, move, profiles, virtual processes.</summary>
public interface IQuickerRpcActionCatalogHost
{
    Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcMoveActionResult> MoveActionAsync(
        string actionId,
        string targetProfile,
        int? targetRow = null,
        int? targetCol = null,
        bool allowSwap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
        CancellationToken cancellationToken = default);
}
