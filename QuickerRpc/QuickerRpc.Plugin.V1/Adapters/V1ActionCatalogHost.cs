using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ActionCatalogHost : IQuickerRpcActionCatalogHost
{
    private readonly ActionCreateService _create;
    private readonly ActionDeleteService _delete;
    private readonly ActionMoveService _move;
    private readonly GlobalProfileCreateService _createProfiles;
    private readonly ProfileDeleteService _deleteProfiles;
    private readonly VirtualProcessCreateService _virtualProcess;

    public V1ActionCatalogHost(
        ActionCreateService create,
        ActionDeleteService delete,
        ActionMoveService move,
        GlobalProfileCreateService createProfiles,
        ProfileDeleteService deleteProfiles,
        VirtualProcessCreateService virtualProcess)
    {
        _create = create;
        _delete = delete;
        _move = move;
        _createProfiles = createProfiles;
        _deleteProfiles = deleteProfiles;
        _virtualProcess = virtualProcess;
    }

    public Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_create.CreateAction(title, description, icon, profileId));
    }

    public Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default) =>
        _delete.DeleteActionAsync(actionId, showConfirm);

    public Task<QuickerRpcMoveActionResult> MoveActionAsync(
        string actionId,
        string targetProfile,
        int? targetRow = null,
        int? targetCol = null,
        bool allowSwap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_move.MoveAction(
            actionId,
            targetProfile,
            targetRow,
            targetCol,
            allowSwap,
            onNoEmptySlot,
            onOccupiedSlot));
    }

    public Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_createProfiles.CreateGlobalProfiles(count, insertAfterFirstPage));
    }

    public Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_createProfiles.ReorderGlobalProfilesAfterFirst(profileIds));
    }

    public Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_deleteProfiles.DeleteEmptyProfiles(profileIdsOrNames));
    }

    public Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_deleteProfiles.PruneEmptyProfiles(scope));
    }

    public Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_virtualProcess.EnsureVirtualProcess(
            exeFile,
            displayName,
            profileNamePrefix,
            collectSubProgramName,
            dedicatedSubProgramOnly));
    }
}
