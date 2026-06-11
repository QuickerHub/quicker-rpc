using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Rpc;

/// <summary>
/// Quicker-side JSON-RPC target for external CLI clients.
/// </summary>
public sealed class QuickerRpcService : IQuickerRpcService
{
    public const int CurrentProtocolVersion = 1;

    private readonly ActionPublishService _actionPublishService;
    private readonly ActionDocService _actionDocService;
    private readonly ActionSearchService _actionSearchService;
    private readonly SubProgramSearchService _subProgramSearchService;
    private readonly ActionDeleteService _actionDeleteService;
    private readonly ActionMoveService _actionMoveService;
    private readonly GlobalProfileCreateService _globalProfileCreateService;
    private readonly ProfileDeleteService _profileDeleteService;
    private readonly VirtualProcessCreateService _virtualProcessCreateService;
    private readonly ActionCreateService _actionCreateService;
    private readonly ActionEditService _actionEditService;
    private readonly ActionRunService _actionRunService;
    private readonly XActionTraceRunService _xActionTraceRunService;
    private readonly ActionFloatService _actionFloatService;
    private readonly HeadlessVariableEditService _headlessVariableEditService;
    private readonly HeadlessActionProgramService _headlessActionProgramService;
    private readonly HeadlessSubProgramProgramService _headlessSubProgramProgramService;
    private readonly FontAwesomeIconSearchService _fontAwesomeIconSearchService;
    private readonly CodeSyntaxCheckService _codeSyntaxCheckService;
    private readonly ExpressionExecuteService _expressionExecuteService;
    private readonly ChromeControlExecuteService _chromeControlExecuteService;
    private readonly QuickerSettingsService _settingsService;
    private readonly QuickerSettingsUiService _settingsUiService;
    private readonly LauncherResolveService _launcherResolveService;
    private readonly AgentSearchIndexCoordinator _searchIndexCoordinator;
    private readonly IPopupMessageService _popup;

    public QuickerRpcService(
        ActionPublishService actionPublishService,
        ActionDocService actionDocService,
        ActionSearchService actionSearchService,
        SubProgramSearchService subProgramSearchService,
        ActionDeleteService actionDeleteService,
        ActionMoveService actionMoveService,
        GlobalProfileCreateService globalProfileCreateService,
        ProfileDeleteService profileDeleteService,
        VirtualProcessCreateService virtualProcessCreateService,
        ActionCreateService actionCreateService,
        ActionEditService actionEditService,
        ActionRunService actionRunService,
        XActionTraceRunService xActionTraceRunService,
        ActionFloatService actionFloatService,
        HeadlessVariableEditService headlessVariableEditService,
        HeadlessActionProgramService headlessActionProgramService,
        HeadlessSubProgramProgramService headlessSubProgramProgramService,
        FontAwesomeIconSearchService fontAwesomeIconSearchService,
        CodeSyntaxCheckService codeSyntaxCheckService,
        ExpressionExecuteService expressionExecuteService,
        ChromeControlExecuteService chromeControlExecuteService,
        QuickerSettingsService settingsService,
        QuickerSettingsUiService settingsUiService,
        LauncherResolveService launcherResolveService,
        AgentSearchIndexCoordinator searchIndexCoordinator,
        IPopupMessageService popup)
    {
        _actionPublishService = actionPublishService;
        _actionDocService = actionDocService;
        _actionSearchService = actionSearchService;
        _subProgramSearchService = subProgramSearchService;
        _actionDeleteService = actionDeleteService;
        _actionMoveService = actionMoveService;
        _globalProfileCreateService = globalProfileCreateService;
        _profileDeleteService = profileDeleteService;
        _virtualProcessCreateService = virtualProcessCreateService;
        _actionCreateService = actionCreateService;
        _actionEditService = actionEditService;
        _actionRunService = actionRunService;
        _xActionTraceRunService = xActionTraceRunService;
        _actionFloatService = actionFloatService;
        _headlessVariableEditService = headlessVariableEditService;
        _headlessActionProgramService = headlessActionProgramService;
        _headlessSubProgramProgramService = headlessSubProgramProgramService;
        _fontAwesomeIconSearchService = fontAwesomeIconSearchService;
        _codeSyntaxCheckService = codeSyntaxCheckService;
        _expressionExecuteService = expressionExecuteService;
        _chromeControlExecuteService = chromeControlExecuteService;
        _settingsService = settingsService;
        _settingsUiService = settingsUiService;
        _launcherResolveService = launcherResolveService;
        _searchIndexCoordinator = searchIndexCoordinator;
        _popup = popup;
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

    public Task<QuickerRpcAccountInfo> GetQuickerAccountAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QuickerAccountAccessor.TryGetAccountInfo());
    }

    public Task<QuickerRpcWebSessionInfo> GetQuickerWebSessionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QuickerAccountAccessor.TryGetWebSessionInfo());
    }

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
                    result = await _actionPublishService
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
                    _popup.Success(text);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "分享动作失败" : result.Message);
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
            () => _actionPublishService.PreflightPublishSharedActionAsync(
                actionId.Trim(),
                request,
                cancellationToken),
            cancellationToken);
    }

    public Task<QuickerRpcActionDocResult> GetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _actionDocService.GetDetailHtmlAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcActionDocResult> SetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default) =>
        _actionDocService.SetDetailHtmlAsync(idOrSharedId, htmlContent, cancellationToken);

    public Task<QuickerRpcActionDocResult> SubmitSharedActionForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default) =>
        _actionDocService.SubmitForReviewAsync(idOrSharedId, htmlContent, cancellationToken);

    public Task<string> ProbeSharedActionDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _actionDocService.ProbeApisAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcSharedInfoWebSessionResult> PrepareSharedInfoWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _actionDocService.PrepareWebSessionAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_actionSearchService.SearchActions(query, maxCount, scope)),
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
            () => Task.FromResult(_headlessSubProgramProgramService.ListSubPrograms(query, maxCount)),
            cancellationToken);
    }

    public Task<QuickerRpcCreateSubProgramResult> CreateGlobalSubProgramAsync(
        string name,
        string? description = null,
        string? icon = null,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () =>
            {
                var result = _headlessSubProgramProgramService.CreateSubProgram(name, description, icon);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "创建公共子程序失败" : result.Message);
                }

                return Task.FromResult(result);
            },
            cancellationToken);
    }

    public Task<QuickerRpcGetCompressedSubProgramResult> GetCompressedSubProgramAsync(
        string subProgramIdOrName,
        string? returnMode = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessSubProgramProgramService.GetCompressedSubProgram(subProgramIdOrName, returnMode)),
            cancellationToken);
    }

    public Task<QuickerRpcApplySubProgramPatchResult> ApplySubProgramPatchAsync(
        string subProgramIdOrName,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessSubProgramProgramService.ApplyPatchToSubProgram(
                subProgramIdOrName,
                patchJson,
                expectedEditVersion,
                force)),
            cancellationToken);
    }

    public Task<QuickerRpcApplySubProgramPatchResult> ApplyProgramToSubProgramAsync(
        string subProgramIdOrName,
        string programJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessSubProgramProgramService.ApplyProgramToSubProgram(
                subProgramIdOrName,
                programJson,
                expectedEditVersion,
                force)),
            cancellationToken);
    }

    public Task<QuickerRpcActionUpdateResult> EditGlobalSubProgramAsync(
        string subProgramIdOrName,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessSubProgramProgramService.EditSubProgram(subProgramIdOrName)),
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
                var result = _headlessSubProgramProgramService.DeleteSubProgram(subProgramIdOrName, skipConfirm);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "删除公共子程序失败" : result.Message);
                }

                return await Task.FromResult(result).ConfigureAwait(true);
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
                var result = await _actionDeleteService
                    .DeleteActionAsync(actionId.Trim(), showConfirm)
                    .ConfigureAwait(true);

                if (result.Ok)
                {
                    var text = string.IsNullOrWhiteSpace(result.Message)
                        ? $"动作已删除：{result.ActionId}"
                        : result.Message;
                    _popup.Success(text);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "删除动作失败" : result.Message);
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
            () => Task.FromResult(_actionCreateService.CreateAction(title, description, icon, profileId)),
            cancellationToken);
    }

    public Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () =>
            {
                var result = _globalProfileCreateService.CreateGlobalProfiles(count, insertAfterFirstPage);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "创建全局动作页失败" : result.Message);
                }

                return Task.FromResult(result);
            },
            cancellationToken);
    }

    public Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () =>
            {
                var result = _globalProfileCreateService.ReorderGlobalProfilesAfterFirst(profileIds);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "调整全局动作页顺序失败" : result.Message);
                }

                return Task.FromResult(result);
            },
            cancellationToken);
    }

    public Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default)
    {
        return InvokeOnDispatcherAsync(
            () =>
            {
                var result = _profileDeleteService.DeleteEmptyProfiles(profileIdsOrNames);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "删除动作页失败" : result.Message);
                }

                return Task.FromResult(result);
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
            () =>
            {
                var result = _profileDeleteService.PruneEmptyProfiles(scope.Trim());
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "清理空白动作页失败" : result.Message);
                }

                return Task.FromResult(result);
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
                var result = _virtualProcessCreateService.EnsureVirtualProcess(
                    exeFile.Trim(),
                    displayName.Trim(),
                    profileNamePrefix.Trim(),
                    string.IsNullOrWhiteSpace(collectSubProgramName) ? null : collectSubProgramName.Trim(),
                    dedicatedSubProgramOnly);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "创建虚拟进程失败" : result.Message);
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
                var result = _actionMoveService.MoveAction(
                    actionId.Trim(),
                    targetProfile.Trim(),
                    targetRow,
                    targetCol,
                    allowSwap,
                    onNoEmptySlot,
                    onOccupiedSlot);
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else if (!result.NeedsUserChoice)
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "移动动作失败" : result.Message);
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

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_actionEditService.EditAction(actionId.Trim())),
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
            () => _actionRunService.RunAction(
                actionId.Trim(),
                inputParam,
                enableDebugging,
                waitForComplete),
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

        var streamCallbacks = QuickerRpcTraceSink.CurrentClientCallbacks;
        return InvokeOffUiThreadAsync(
            () => _xActionTraceRunService.RunAction(
                actionId.Trim(),
                inputParam,
                progress,
                streamCallbacks),
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

        var streamCallbacks = QuickerRpcTraceSink.CurrentClientCallbacks;
        return InvokeOffUiThreadAsync(
            () => _xActionTraceRunService.RunXAction(
                xActionJson,
                inputParam,
                projectDirectory: null,
                progress,
                streamCallbacks),
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
                var result = _actionFloatService.FloatAction(actionId.Trim());
                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "悬浮动作失败" : result.Message);
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
                var result = await _headlessVariableEditService
                    .EditVariableAsync(subProgramIdOrName.Trim(), variableKey.Trim(), defaultValue ?? string.Empty)
                    .ConfigureAwait(true);

                if (result.Ok)
                {
                    _popup.Success(result.Message);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "修改变量默认值失败" : result.Message);
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

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessActionProgramService.GetCompressedActionById(actionId, returnMode)),
            cancellationToken);
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

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessActionProgramService.ApplyXActionToAction(
                actionId.Trim(),
                xActionJson,
                expectedEditVersion,
                force)),
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

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessActionProgramService.ApplyActionPatchToAction(
                actionId.Trim(),
                patchJson,
                expectedEditVersion,
                force)),
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
            () => Task.FromResult(_headlessActionProgramService.UpdateActionMetadata(
                actionId.Trim(),
                title,
                description,
                icon,
                contextMenuData,
                expectedEditVersion,
                force)),
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
            () => Task.FromResult(
                _headlessActionProgramService.SearchActionSummaries(query, maxResults, scope, sort)),
            cancellationToken);
    }

    public Task<QuickerRpcSearchStepRunnersResult> SearchStepRunnersAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessActionProgramService.SearchStepRunners(keyword, maxResults)),
            cancellationToken);
    }

    public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(
                _headlessActionProgramService.GetStepRunnerDetail(stepRunnerKey, controlFieldValue)),
            cancellationToken);
    }

    public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerUiDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(
                _headlessActionProgramService.GetStepRunnerUiDetail(stepRunnerKey, controlFieldValue)),
            cancellationToken);
    }

    public Task<QuickerRpcActionStepSummariesResult> GetActionStepSummariesAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(
                () => ActionStepSummaryService.GetSummaries(steps, embeddedSubProgramsJson))
            ?? new QuickerRpcActionStepSummariesResult
            {
                Success = false,
                ErrorMessage = "Step summaries unavailable.",
            });
    }

    public Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardSpecialFormatAsync(
        string format,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => ClipboardSpecialFormatService.Read(format))
            ?? new QuickerRpcClipboardSpecialFormatReadResult
            {
                Success = false,
                ErrorMessage = "Clipboard read unavailable.",
            });
    }

    public Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardSpecialFormatAsync(
        string format,
        string text,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => ClipboardSpecialFormatService.Write(format, text))
            ?? new QuickerRpcClipboardSpecialFormatWriteResult
            {
                Success = false,
                ErrorMessage = "Clipboard write unavailable.",
            });
    }

    public Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(
        string? query,
        int maxResults = 40,
        bool expand = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_fontAwesomeIconSearchService.Search(query, maxResults, expand));
    }

    public Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(
        IList<string> specs,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_fontAwesomeIconSearchService.ResolveMany(specs));
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionSyntaxAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_codeSyntaxCheckService.CheckExpression(code, variableTypes));
    }

    public Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_expressionExecuteService.Execute(code, variablesJson, onUiThread));
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
            () => _chromeControlExecuteService.Execute(
                operation.Trim(),
                parametersJson,
                sessionId),
            cancellationToken);
    }

    public Task<QuickerRpcChromeControlTabsResult> ListBrowserTabsAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return InvokeOffUiThreadAsync(
            () => _chromeControlExecuteService.ListTabs(),
            cancellationToken);
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptSyntaxAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_codeSyntaxCheckService.CheckCSharpScript(code, references));
    }

    public Task<QuickerRpcSearchSettingsResult> SearchSettingsAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => _settingsService.Search(query, maxResults))
            ?? new QuickerRpcSearchSettingsResult { Ok = false, Message = "Settings search unavailable." });
    }

    public Task<QuickerRpcListSettingsResult> ListSettingsAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => _settingsService.List(scope, maxResults))
            ?? new QuickerRpcListSettingsResult { Ok = false, Message = "Settings list unavailable." });
    }

    public Task<QuickerRpcGetSettingResult> GetSettingAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => _settingsService.Get(key))
            ?? new QuickerRpcGetSettingResult { Ok = false, Message = "Settings get unavailable." });
    }

    public Task<QuickerRpcSetSettingResult> SetSettingAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => _settingsService.Set(key, value))
            ?? new QuickerRpcSetSettingResult { Ok = false, Message = "Settings set unavailable." });
    }

    public Task<QuickerRpcApplySettingsResult> ApplySettingsAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => _settingsService.Apply(changes))
            ?? new QuickerRpcApplySettingsResult { Ok = false, Message = "Settings apply unavailable." });
    }

    public Task<QuickerRpcListSettingsPagesResult> ListSettingsPagesAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => _settingsUiService.ListPages())
            ?? new QuickerRpcListSettingsPagesResult { Ok = false, Message = "Settings pages unavailable." });
    }

    public Task<QuickerRpcListSettingsDirectLinksResult> ListSettingsDirectLinksAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_settingsUiService.ListDirectLinks());
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
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(
                () => _settingsUiService.Open(target, query, settingKey, exeFile, searchText, preset))
            ?? new QuickerRpcOpenSettingsUiResult { Ok = false, Message = "Open settings UI unavailable." });
    }

    public Task<QuickerRpcResolveSettingsIntentResult> ResolveSettingsIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(
                () => _settingsUiService.ResolveIntent(query, settingKey, preset))
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
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(
                () => _launcherResolveService.Resolve(query, maxResults, scopes))
            ?? new QuickerRpcResolveLauncherIntentResult
            {
                Ok = false,
                Query = query ?? string.Empty,
                Message = "Resolve launcher intent unavailable.",
            });
    }

    public Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var diagnostics = _searchIndexCoordinator.GetDiagnostics();
        var regions = new List<QuickerRpcSearchIndexRegionStatus>(diagnostics.Count);
        foreach (var item in diagnostics)
        {
            regions.Add(new QuickerRpcSearchIndexRegionStatus
            {
                Region = ToSearchIndexRegionName(item.Region),
                Status = ToSearchIndexStatusName(item.Status),
                Generation = item.Generation,
                BuildStartedUtcMs = item.BuildStartedUtcMs,
                BuildCompletedUtcMs = item.BuildCompletedUtcMs,
                LastBuildDurationMs = item.LastBuildDurationMs,
                DocumentCount = item.DocumentCount,
            });
        }

        return Task.FromResult(new QuickerRpcSearchIndexStatusResult { Ok = true, Regions = regions });
    }

    public Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var normalized = (region ?? "all").Trim().ToLowerInvariant();
        switch (normalized)
        {
            case "all":
                _searchIndexCoordinator.RebuildAll();
                break;
            case "action":
                _searchIndexCoordinator.InvalidateAction();
                break;
            case "subprogram":
                _searchIndexCoordinator.InvalidateSubProgram();
                break;
            default:
                return Task.FromResult(new QuickerRpcSearchIndexRebuildResult
                {
                    Ok = false,
                    Message = $"Unknown region: {region}. Use action, subprogram, or all.",
                });
        }

        return Task.FromResult(new QuickerRpcSearchIndexRebuildResult
        {
            Ok = true,
            Message = $"Rebuild scheduled for {normalized}.",
        });
    }

    private static string ToSearchIndexRegionName(SearchRegion region) =>
        region switch
        {
            SearchRegion.Action => "action",
            SearchRegion.SubProgram => "subprogram",
            _ => region.ToString().ToLowerInvariant(),
        };

    private static string ToSearchIndexStatusName(AgentSearchIndexStatus status) =>
        status switch
        {
            AgentSearchIndexStatus.Ready => "ready",
            AgentSearchIndexStatus.Building => "building",
            _ => "missing",
        };

    private static Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken) =>
        Task.Run(action, cancellationToken);

    private static async Task<T> InvokeOnDispatcherAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            return await action().ConfigureAwait(true);
        }

        var pending = await dispatcher.InvokeAsync(action, DispatcherPriority.Normal, cancellationToken).Task
            .ConfigureAwait(false);
        return await pending.ConfigureAwait(false);
    }
}
