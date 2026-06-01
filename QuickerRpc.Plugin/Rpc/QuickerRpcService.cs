using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Rpc;

/// <summary>
/// Quicker-side JSON-RPC target for external CLI clients.
/// </summary>
public sealed class QuickerRpcService : IQuickerRpcService
{
    public const int CurrentProtocolVersion = 1;

    private readonly ActionUpdateService _actionUpdateService;
    private readonly ActionSearchService _actionSearchService;
    private readonly SubProgramSearchService _subProgramSearchService;
    private readonly ActionDeleteService _actionDeleteService;
    private readonly ActionCreateService _actionCreateService;
    private readonly ActionEditService _actionEditService;
    private readonly ActionRunService _actionRunService;
    private readonly DesignerVariableEditService _designerVariableEditService;
    private readonly HeadlessActionProgramService _headlessActionProgramService;
    private readonly IPopupMessageService _popup;

    public QuickerRpcService(
        ActionUpdateService actionUpdateService,
        ActionSearchService actionSearchService,
        SubProgramSearchService subProgramSearchService,
        ActionDeleteService actionDeleteService,
        ActionCreateService actionCreateService,
        ActionEditService actionEditService,
        ActionRunService actionRunService,
        DesignerVariableEditService designerVariableEditService,
        HeadlessActionProgramService headlessActionProgramService,
        IPopupMessageService popup)
    {
        _actionUpdateService = actionUpdateService;
        _actionSearchService = actionSearchService;
        _subProgramSearchService = subProgramSearchService;
        _actionDeleteService = actionDeleteService;
        _actionCreateService = actionCreateService;
        _actionEditService = actionEditService;
        _actionRunService = actionRunService;
        _designerVariableEditService = designerVariableEditService;
        _headlessActionProgramService = headlessActionProgramService;
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

        return InvokeOnDispatcherAsync(
            async () =>
            {
                var result = await _actionUpdateService
                    .UpdateSharedActionAsync(actionId.Trim(), changeLog ?? string.Empty)
                    .ConfigureAwait(true);

                if (result.Ok)
                {
                    var text = string.IsNullOrWhiteSpace(result.Message)
                        ? $"动作已更新：{result.ActionId}"
                        : result.Message;
                    _popup.Success(text);
                }
                else
                {
                    _popup.Error(string.IsNullOrWhiteSpace(result.Message) ? "更新动作失败" : result.Message);
                }

                return result;
            },
            cancellationToken);
    }

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

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_subProgramSearchService.Search(query, maxCount)),
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

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_actionRunService.RunAction(
                actionId.Trim(),
                inputParam,
                enableDebugging,
                waitForComplete)),
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
                var result = await _designerVariableEditService
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

    public Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessActionProgramService.SearchActionSummaries(query, maxResults, scope)),
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
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_headlessActionProgramService.GetStepRunnerDetail(stepRunnerKey)),
            cancellationToken);
    }

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
