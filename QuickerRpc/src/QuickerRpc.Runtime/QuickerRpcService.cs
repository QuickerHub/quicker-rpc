using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

/// <summary>
/// Quicker-side JSON-RPC target for external CLI clients.
/// </summary>
public sealed class QuickerRpcService : IQuickerRpcService
{
    public const int CurrentProtocolVersion = 1;

    private readonly IQuickerRpcHost _host;
    private readonly IQuickerRpcCallScheduler _scheduler;
    private readonly IQuickerRpcUserFeedback _feedback;
    private readonly ActionProgramRpcHandler _actionProgramHandler;
    private readonly SubProgramRpcHandler _subProgramHandler;

    public QuickerRpcService(
        IQuickerRpcHost host,
        IQuickerRpcCallScheduler scheduler,
        IQuickerRpcUserFeedback feedback,
        ActionProgramRpcHandler actionProgramHandler,
        SubProgramRpcHandler subProgramHandler)
    {
        _host = host;
        _scheduler = scheduler;
        _feedback = feedback;
        _actionProgramHandler = actionProgramHandler;
        _subProgramHandler = subProgramHandler;
    }

    public Task<string> PingAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult("pong");
    }

    public Task<int> GetProtocolVersionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(CurrentProtocolVersion);
    }

    public Task<QuickerRpcAccountInfo> GetQuickerAccountAsync(CancellationToken cancellationToken = default) =>
        _host.Session.GetAccountAsync(cancellationToken);

    public Task<QuickerRpcWebSessionInfo> GetQuickerWebSessionAsync(CancellationToken cancellationToken = default) =>
        _host.Session.GetWebSessionAsync(cancellationToken);

    /// <summary>Legacy RPC/CLI update entry; delegates to <see cref="PublishSharedActionAsync"/>.</summary>
    public Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        return MapPublishToUpdateResultAsync(
            PublishSharedActionAsync(
                actionId,
                new QuickerRpcActionPublishRequest { ChangeLog = changeLog },
                cancellationToken),
            actionId.Trim());
    }

    private static async Task<QuickerRpcActionUpdateResult> MapPublishToUpdateResultAsync(
        Task<QuickerRpcActionPublishResult> publishTask,
        string actionId)
    {
        var publish = await publishTask.ConfigureAwait(false);
        return new QuickerRpcActionUpdateResult
        {
            Ok = publish.Ok,
            ActionId = publish.SharedActionId ?? publish.ActionId ?? actionId,
            Message = publish.Message,
        };
    }

    public Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionPublishResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        request ??= new QuickerRpcActionPublishRequest();

        return InvokeOnDispatcherAsync(
            async () =>
            {
                QuickerRpcActionPublishResult result;
                try
                {
                    result = await _host.ActionSharing
                        .PublishSharedActionAsync(actionId.Trim(), request, cancellationToken)
                        .ConfigureAwait(true);
                }
                catch (InvalidOperationException ex)
                {
                    result = new QuickerRpcActionPublishResult
                    {
                        Ok = false,
                        ActionId = actionId.Trim(),
                        Message = ex.Message,
                    };
                }

                if (result.Ok)
                {
                    var text = string.Equals(result.Mode, "update", StringComparison.OrdinalIgnoreCase)
                        ? (string.IsNullOrWhiteSpace(result.Message)
                            ? $"动作已更新：{result.SharedActionId ?? result.ActionId}"
                            : result.Message)
                        : (string.IsNullOrWhiteSpace(result.Message)
                            ? $"动作已分享：{result.ShareUrl}"
                            : result.Message);
                    _feedback.Success(text);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "分享动作失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionPublishPreflightResult
            {
                Ready = false,
                Message = "actionId is required.",
                Issues =
                [
                    new QuickerRpcActionPublishIssue
                    {
                        Code = "INVALID_REQUEST",
                        Field = "actionId",
                        Message = "actionId is required.",
                        Severity = "error",
                    },
                ],
            });
        }

        request ??= new QuickerRpcActionPublishRequest();

        return InvokeOnDispatcherAsync(
            () => _host.ActionSharing.PreflightPublishSharedActionAsync(
                actionId.Trim(),
                request,
                cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcActionDocResult> GetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _host.ActionDocs.GetDetailHtmlAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcActionDocResult> SetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default) =>
        _host.ActionDocs.SetDetailHtmlAsync(idOrSharedId, htmlContent, cancellationToken);

    public Task<QuickerRpcActionDocResult> SubmitSharedActionForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default) =>
        _host.ActionDocs.SubmitForReviewAsync(idOrSharedId, htmlContent, cancellationToken);

    public Task<string> ProbeSharedActionDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _host.ActionDocs.ProbeDetailApisAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcSharedInfoWebSessionResult> PrepareSharedInfoWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _host.ActionDocs.PrepareWebSessionAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.Search.SearchActionsAsync(query, maxCount, scope, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return ListGlobalSubProgramsAsync(query, maxCount, cancellationToken);
    }

    public Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
        string? query,
        int maxCount = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.Search.ListGlobalSubProgramsAsync(query, maxCount, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcCreateSubProgramResult> CreateGlobalSubProgramAsync(
        string name,
        string? description = null,
        string? icon = null,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            async () =>
            {
                var write = await _host.SubPrograms.TryCreateAsync(
                        new QuickerRpcSubProgramCreate
                        {
                            Name = name ?? string.Empty,
                            Description = description,
                            Icon = icon,
                        },
                        cancellationToken)
                    .ConfigureAwait(true);
                var result = HostWireMappers.ToCreateSubProgramResult(write);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "创建公共子程序失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcGetCompressedSubProgramResult> GetCompressedSubProgramAsync(
        string subProgramIdOrName,
        string? returnMode = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOffUiThreadAsync(
            () => _subProgramHandler.GetCompressedSubProgramAsync(
                    _host.SubPrograms,
                    subProgramIdOrName,
                    returnMode,
                    cancellationToken)
                .ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcApplySubProgramPatchResult> ApplySubProgramPatchAsync(
        string subProgramIdOrName,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        return InvokeOffUiThreadAsync(
            () => _host.SubPrograms.TryApplyPatchAsync(
                    subProgramIdOrName,
                    patchJson,
                    expectedEditVersion,
                    force,
                    cancellationToken)
                .ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcApplySubProgramPatchResult> ApplyProgramToSubProgramAsync(
        string subProgramIdOrName,
        string programJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        return InvokeOffUiThreadAsync(
            () =>
            {
                var write = _host.SubPrograms.TryWriteBodyAsync(
                        new QuickerRpcSubProgramBodyWrite
                        {
                            IdOrName = subProgramIdOrName,
                            BodyJson = programJson,
                            Options = new QuickerRpcSubProgramWriteOptions
                            {
                                ExpectedEditVersion = expectedEditVersion,
                                Force = force,
                            },
                        },
                        cancellationToken)
                    .ConfigureAwait(false).GetAwaiter().GetResult();
                return HostWireMappers.ToApplySubProgramResult(write);
            },
            cancellationToken);
    }

    public Task<QuickerRpcActionUpdateResult> UpdateSharedSubProgramAsync(
        string subProgramIdOrName,
        string? changeLog = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subProgramIdOrName))
        {
            return Task.FromResult(new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "subProgram id or name is required.",
            });
        }

        return MapPublishToUpdateResultAsync(
            PublishSharedSubProgramAsync(
                subProgramIdOrName,
                new QuickerRpcActionPublishRequest { ChangeLog = changeLog },
                cancellationToken),
            subProgramIdOrName.Trim());
    }

    public Task<QuickerRpcActionPublishResult> PublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subProgramIdOrName))
        {
            return Task.FromResult(new QuickerRpcActionPublishResult
            {
                Ok = false,
                Message = "subProgram id or name is required.",
            });
        }

        request ??= new QuickerRpcActionPublishRequest();

        return InvokeOnDispatcherAsync(
            async () =>
            {
                QuickerRpcActionPublishResult result;
                try
                {
                    result = await _host.SubPrograms
                        .PublishSharedSubProgramAsync(subProgramIdOrName.Trim(), request, cancellationToken)
                        .ConfigureAwait(true);
                }
                catch (InvalidOperationException ex)
                {
                    result = new QuickerRpcActionPublishResult
                    {
                        Ok = false,
                        ActionId = subProgramIdOrName.Trim(),
                        Message = ex.Message,
                    };
                }

                if (result.Ok)
                {
                    var text = string.Equals(result.Mode, "update", StringComparison.OrdinalIgnoreCase)
                        ? (string.IsNullOrWhiteSpace(result.Message)
                            ? $"子程序已更新：{result.SharedActionId ?? result.ActionId}"
                            : result.Message)
                        : (string.IsNullOrWhiteSpace(result.Message)
                            ? $"子程序已分享：{result.ShareUrl}"
                            : result.Message);
                    _feedback.Success(text);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "分享子程序失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subProgramIdOrName))
        {
            return Task.FromResult(new QuickerRpcActionPublishPreflightResult
            {
                Ready = false,
                Message = "subProgram id or name is required.",
            });
        }

        request ??= new QuickerRpcActionPublishRequest();
        return InvokeOnDispatcherAsync(
            () => _host.SubPrograms.PreflightPublishSharedSubProgramAsync(
                subProgramIdOrName.Trim(),
                request,
                cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcActionUpdateResult> EditGlobalSubProgramAsync(
        string subProgramIdOrName,
        CancellationToken cancellationToken = default)
    {
        return InvokeOffUiThreadAsync(
            () => _host.Designer!.OpenSubProgramEditorAsync(subProgramIdOrName, cancellationToken)
                .ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcActionUpdateResult> DeleteGlobalSubProgramAsync(
        string subProgramIdOrName,
        bool skipConfirm = true,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            async () =>
            {
                var mutation = await _host.SubPrograms.TryDeleteAsync(subProgramIdOrName, skipConfirm, cancellationToken)
                    .ConfigureAwait(true);
                var result = HostWireMappers.ToActionUpdateResult(mutation);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "删除公共子程序失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.ActionCatalog.DeleteActionAsync(actionId.Trim(), showConfirm, cancellationToken)
                    .ConfigureAwait(true);

                if (result.Ok)
                {
                    var text = string.IsNullOrWhiteSpace(result.Message)
                        ? $"动作已删除：{result.ActionId}"
                        : result.Message;
                    _feedback.Success(text);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "删除动作失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () => _host.ActionCatalog.CreateActionAsync(title, description, icon, profileId, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.ActionCatalog.CreateGlobalProfilesAsync(count, insertAfterFirstPage, cancellationToken)
                    .ConfigureAwait(true);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "创建全局动作页失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.ActionCatalog.ReorderGlobalProfilesAfterFirstAsync(profileIds, cancellationToken)
                    .ConfigureAwait(true);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "调整全局动作页顺序失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.ActionCatalog.DeleteEmptyProfilesAsync(profileIdsOrNames, cancellationToken)
                    .ConfigureAwait(true);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "删除动作页失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(scope))
        {
            return Task.FromResult(new QuickerRpcDeleteProfileResult
            {
                Ok = false,
                Message = "scope is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.ActionCatalog.PruneEmptyProfilesAsync(scope.Trim(), cancellationToken)
                    .ConfigureAwait(true);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "清理空白动作页失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(exeFile))
        {
            return Task.FromResult(new QuickerRpcCreateVirtualProcessResult
            {
                Ok = false,
                Message = "exeFile is required.",
            });
        }

        if (string.IsNullOrWhiteSpace(displayName))
        {
            return Task.FromResult(new QuickerRpcCreateVirtualProcessResult
            {
                Ok = false,
                Message = "displayName is required.",
            });
        }

        if (string.IsNullOrWhiteSpace(profileNamePrefix))
        {
            return Task.FromResult(new QuickerRpcCreateVirtualProcessResult
            {
                Ok = false,
                Message = "profileNamePrefix is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            () =>
            {
                var result = _host.ActionCatalog.EnsureVirtualProcessAsync(
                    exeFile.Trim(),
                    displayName.Trim(),
                    profileNamePrefix.Trim(),
                    string.IsNullOrWhiteSpace(collectSubProgramName) ? null : collectSubProgramName.Trim(),
                    dedicatedSubProgramOnly,
                    cancellationToken).ConfigureAwait(true).GetAwaiter().GetResult();
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "创建虚拟进程失败" : result.Message);
                }

                return Task.FromResult(result);
            },
            cancellationToken);
    }

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
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcMoveActionResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        if (string.IsNullOrWhiteSpace(targetProfile))
        {
            return Task.FromResult(new QuickerRpcMoveActionResult
            {
                Ok = false,
                ActionId = actionId.Trim(),
                Message = "targetProfile is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            () =>
            {
                var result = _host.ActionCatalog.MoveActionAsync(
                    actionId.Trim(),
                    targetProfile.Trim(),
                    targetRow,
                    targetCol,
                    allowSwap,
                    onNoEmptySlot,
                    onOccupiedSlot,
                    cancellationToken).ConfigureAwait(true).GetAwaiter().GetResult();
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else if (!result.NeedsUserChoice)
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "移动动作失败" : result.Message);
                }

                return Task.FromResult(result);
            },
            cancellationToken);
    }

    public Task<QuickerRpcActionUpdateResult> EditActionAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        return InvokeOffUiThreadAsync(
            () => _host.Designer!.OpenActionEditorAsync(actionId.Trim(), cancellationToken)
                .ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcActionRunResult> RunActionAsync(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionRunResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOffUiThreadAsync(
            () => _host.ActionRuns.RunAsync(
                actionId.Trim(),
                inputParam,
                enableDebugging,
                waitForComplete,
                cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcActionTraceRunResult> RunActionTraceAsync(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcActionTraceRunResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOffUiThreadAsync(
            () => _host.ActionRuns.RunTraceAsync(
                actionId.Trim(),
                inputParam,
                progress,
                cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(xActionJson))
        {
            return Task.FromResult(new QuickerRpcActionTraceRunResult
            {
                Ok = false,
                Message = "xActionJson is required.",
            });
        }

        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOffUiThreadAsync(
            () => _host.ActionRuns.RunXActionTraceAsync(
                xActionJson,
                inputParam,
                progress,
                cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcFloatActionResult> FloatActionAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.ActionRuns.FloatAsync(actionId.Trim(), cancellationToken)
                    .ConfigureAwait(true);
                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "悬浮动作失败" : result.Message);
                }

                return await Task.FromResult(result).ConfigureAwait(true);
            },
            cancellationToken);
    }

    public Task<QuickerRpcSubProgramVariableEditResult> EditGlobalSubProgramVariableAsync(
        string subProgramIdOrName,
        string variableKey,
        string defaultValue,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subProgramIdOrName))
        {
            return Task.FromResult(new QuickerRpcSubProgramVariableEditResult
            {
                Ok = false,
                Message = "subProgramIdOrName is required.",
            });
        }

        if (string.IsNullOrWhiteSpace(variableKey))
        {
            return Task.FromResult(new QuickerRpcSubProgramVariableEditResult
            {
                Ok = false,
                SubProgramIdOrName = subProgramIdOrName.Trim(),
                Message = "variableKey is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _host.SubPrograms.EditVariableAsync(
                        subProgramIdOrName.Trim(),
                        variableKey.Trim(),
                        defaultValue ?? string.Empty,
                        cancellationToken)
                    .ConfigureAwait(true);

                if (result.Ok)
                {
                    _feedback.Success(result.Message);
                }
                else
                {
                    _feedback.Error(string.IsNullOrWhiteSpace(result.Message) ? "修改变量默认值失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

    public Task<QuickerRpcGetCompressedActionResult> GetCompressedActionByIdAsync(
        string actionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOffUiThreadAsync(
            () => _actionProgramHandler.GetCompressedActionByIdAsync(
                    _host.ActionPrograms,
                    actionId,
                    returnMode,
                    cancellationToken)
                .ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.ActionSharing.GetCompressedSharedActionAsync(sharedActionId, returnMode, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
        string keyword,
        int page = 1,
        int? days = null,
        int maxResults = 20,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Search.SearchActionLibraryAsync(keyword, page, days, maxResults, cancellationToken);
    }

    public Task<QuickerRpcApplyXActionResult> ApplyXActionToActionAsync(
        string actionId,
        string xActionJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcApplyXActionResult
            {
                Success = false,
                ErrorMessage = "actionId is required.",
            });
        }

        return InvokeOffUiThreadAsync(
            () =>
            {
                var write = _host.ActionPrograms.TryWriteProgramBodyAsync(
                        new QuickerRpcActionProgramBodyWrite
                        {
                            ActionId = actionId.Trim(),
                            BodyJson = xActionJson,
                            Options = new QuickerRpcActionProgramWriteOptions
                            {
                                ExpectedEditVersion = expectedEditVersion,
                                Force = force,
                            },
                        },
                        cancellationToken)
                    .ConfigureAwait(false).GetAwaiter().GetResult();
                return HostWireMappers.ToApplyXActionResult(write);
            },
            cancellationToken);
    }

    public Task<QuickerRpcApplyActionPatchResult> ApplyActionPatchToActionAsync(
        string actionId,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcApplyActionPatchResult
            {
                Success = false,
                ErrorMessage = "actionId is required.",
            });
        }

        return InvokeOffUiThreadAsync(
            () => _host.ActionPrograms.TryApplyPatchAsync(
                    actionId.Trim(),
                    patchJson,
                    expectedEditVersion,
                    force,
                    cancellationToken)
                .ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcUpdateActionMetadataResult> UpdateActionMetadataAsync(
        string actionId,
        string? title = null,
        string? description = null,
        string? icon = null,
        string? contextMenuData = null,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Task.FromResult(new QuickerRpcUpdateActionMetadataResult
            {
                Success = false,
                ErrorMessage = "actionId is required.",
            });
        }

        return InvokeOnDispatcherAsync(
            () =>
            {
                var write = _host.ActionPrograms.TryUpdatePresentationAsync(
                        new QuickerRpcActionPresentationWrite
                        {
                            ActionId = actionId.Trim(),
                            Title = title,
                            Description = description,
                            Icon = icon,
                            ContextMenuData = contextMenuData,
                            Options = new QuickerRpcActionProgramWriteOptions
                            {
                                ExpectedEditVersion = expectedEditVersion,
                                Force = force,
                            },
                        },
                        cancellationToken)
                    .ConfigureAwait(false).GetAwaiter().GetResult();
                return Task.FromResult(HostWireMappers.ToUpdateMetadataResult(write));
            },
            cancellationToken);
    }

    public Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        string? sort = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.Search.SearchActionSummariesAsync(query, maxResults, scope, sort, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcSearchStepRunnersResult> SearchStepRunnersAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.StepRunners.SearchAsync(keyword, maxResults, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcSearchStepRunnersResult> ListStepRunnersAsync(
        int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.StepRunners.ListAsync(maxResults, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.StepRunners.GetDetailAsync(stepRunnerKey, controlFieldValue, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerUiDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.StepRunners.GetUiDetailAsync(stepRunnerKey, controlFieldValue, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcActionStepSummariesResult> GetActionStepSummariesAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return _host.StepRunners.SummarizeStepsAsync(steps, embeddedSubProgramsJson, cancellationToken);
    }

    public Task<QuickerRpcDesignerSearchPageResult> SearchStepQuickInsertAsync(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.Designer!.SearchStepQuickInsertAsync(keyword, skip, subPrograms, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcDesignerSearchPageResult> SearchToolboxModulesAsync(
        string? keyword,
        int skip,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => _host.Designer!.SearchToolboxModulesAsync(keyword, skip, cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardSpecialFormatAsync(
        string format,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return _host.Designer!.ReadClipboardFormatAsync(format, cancellationToken);
    }

    public Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardSpecialFormatAsync(
        string format,
        string text,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return _host.Designer!.WriteClipboardFormatAsync(format, text, cancellationToken);
    }

    public Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(
        string? query,
        int maxResults = 40,
        bool expand = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Designer!.SearchFontAwesomeIconsAsync(query, maxResults, expand, cancellationToken);
    }

    public Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(
        IList<string> specs,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Designer!.ResolveFontAwesomeIconsAsync(specs, cancellationToken);
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionSyntaxAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Expressions.CheckExpressionAsync(code, variableTypes, cancellationToken);
    }

    public Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Expressions.ExecuteExpressionAsync(code, variablesJson, onUiThread, cancellationToken);
    }

    public Task<QuickerRpcChromeControlResult> ExecuteChromeControlAsync(
        string operation,
        string? parametersJson = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(operation))
        {
            return Task.FromResult(new QuickerRpcChromeControlResult
            {
                Ok = false,
                Success = false,
                ErrorCode = "MISSING_OPERATION",
                Message = "operation is required.",
            });
        }

        cancellationToken.ThrowIfCancellationRequested();
        return InvokeOffUiThreadAsync(
            () => _host.ChromeControl!.ExecuteAsync(
                operation.Trim(),
                parametersJson,
                sessionId,
                cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcChromeControlTabsResult> ListBrowserTabsAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return InvokeOffUiThreadAsync(
            () => _host.ChromeControl!.ListTabsAsync(cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult(),
            cancellationToken);
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptSyntaxAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Expressions.CheckCSharpScriptAsync(code, references, cancellationToken);
    }

    public Task<QuickerRpcSearchSettingsResult> SearchSettingsAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.SearchAsync(query, maxResults, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcSearchSettingsResult { Ok = false, Message = "Settings search unavailable." });
    }

    public Task<QuickerRpcListSettingsResult> ListSettingsAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.ListAsync(scope, maxResults, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcListSettingsResult { Ok = false, Message = "Settings list unavailable." });
    }

    public Task<QuickerRpcGetSettingResult> GetSettingAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.GetAsync(key, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcGetSettingResult { Ok = false, Message = "Settings get unavailable." });
    }

    public Task<QuickerRpcSetSettingResult> SetSettingAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.SetAsync(key, value, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcSetSettingResult { Ok = false, Message = "Settings set unavailable." });
    }

    public Task<QuickerRpcApplySettingsResult> ApplySettingsAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.ApplyAsync(changes, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcApplySettingsResult { Ok = false, Message = "Settings apply unavailable." });
    }

    public Task<QuickerRpcListSettingsPagesResult> ListSettingsPagesAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.ListPagesAsync(cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcListSettingsPagesResult { Ok = false, Message = "Settings pages unavailable." });
    }

    public Task<QuickerRpcListSettingsDirectLinksResult> ListSettingsDirectLinksAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Settings.ListDirectLinksAsync(cancellationToken);
    }

    public Task<QuickerRpcOpenSettingsUiResult> OpenSettingsUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.OpenUiAsync(target, exeFile, searchText, query, settingKey, preset, cancellationToken)
                    .ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcOpenSettingsUiResult { Ok = false, Message = "Open settings UI unavailable." });
    }

    public Task<QuickerRpcTriggerListResult> ListTriggersAsync(
        string? query = null,
        string? eventType = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Triggers!.ListAsync(query, eventType, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcTriggerListResult { Ok = false, Message = "Trigger list unavailable." });
    }

    public Task<QuickerRpcTriggerEventTypesResult> ListTriggerEventTypesAsync(
        string? eventType = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Triggers!.ListEventTypesAsync(eventType, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcTriggerEventTypesResult { Ok = false, Message = "Trigger event types unavailable." });
    }

    public Task<QuickerRpcTriggerSaveResult> SaveTriggerAsync(
        QuickerRpcTriggerTaskInfo task,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Triggers!.SaveAsync(task, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcTriggerSaveResult { Ok = false, Message = "Trigger save unavailable." });
    }

    public Task<QuickerRpcTriggerDeleteResult> DeleteTriggerAsync(
        string id,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Triggers!.DeleteAsync(id, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcTriggerDeleteResult { Ok = false, Id = id, Message = "Trigger delete unavailable." });
    }

    public Task<QuickerRpcTriggerSaveResult> SetTriggerEnabledAsync(
        string id,
        bool enabled,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Triggers!.SetEnabledAsync(id, enabled, cancellationToken).ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcTriggerSaveResult { Ok = false, Message = "Trigger enable/disable unavailable." });
    }

    public Task<QuickerRpcResolveSettingsIntentResult> ResolveSettingsIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Settings.ResolveIntentAsync(query, settingKey, preset, cancellationToken)
                    .ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcResolveSettingsIntentResult
            {
                Ok = false,
                Intent = "unknown",
                Message = "Resolve settings intent unavailable.",
            });
    }

    public Task<QuickerRpcResolveLauncherIntentResult> ResolveLauncherIntentAsync(
        string query,
        int maxResults = 12,
        string? scopes = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            _scheduler.InvokeOnUiThreadIfNeeded(
                () => _host.Launcher!.ResolveIntentAsync(query, maxResults, scopes, cancellationToken)
                    .ConfigureAwait(false).GetAwaiter().GetResult())
            ?? new QuickerRpcResolveLauncherIntentResult
            {
                Ok = false,
                Query = query ?? string.Empty,
                Message = "Resolve launcher intent unavailable.",
            });
    }

    public Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default) =>
        _host.Search.GetSearchIndexStatusAsync(cancellationToken);

    public Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default) =>
        _host.Search.RebuildSearchIndexAsync(region, cancellationToken);

    public Task<QuickerRpcDesignerContextResult> GetActionDesignerContextAsync(
        bool includeXAction = false,
        CancellationToken cancellationToken = default) =>
        _host.Designer!.GetDesignerContextAsync(includeXAction, cancellationToken);

    public Task<QuickerRpcTextToolRunResult> RunTextToolAsync(
        string toolId,
        string? currentValue = null,
        int timeoutSeconds = 300,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _host.Designer!.RunTextToolAsync(toolId, currentValue, timeoutSeconds, cancellationToken);
    }

    private Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken) =>
        _scheduler.InvokeOffUiThreadAsync(action, cancellationToken);

    private Task<T> InvokeOnDispatcherAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken) =>
        _scheduler.InvokeOnUiThreadAsync(action, cancellationToken);
}
