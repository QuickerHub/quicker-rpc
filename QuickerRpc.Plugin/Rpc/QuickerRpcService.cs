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
    private readonly ActionDeleteService _actionDeleteService;
    private readonly ActionEditService _actionEditService;
    private readonly GlobalSubProgramVariableEditService _globalSubProgramVariableEditService;
    private readonly IPopupMessageService _popup;

    public QuickerRpcService(
        ActionUpdateService actionUpdateService,
        ActionSearchService actionSearchService,
        ActionDeleteService actionDeleteService,
        ActionEditService actionEditService,
        GlobalSubProgramVariableEditService globalSubProgramVariableEditService,
        IPopupMessageService popup)
    {
        _actionUpdateService = actionUpdateService;
        _actionSearchService = actionSearchService;
        _actionDeleteService = actionDeleteService;
        _actionEditService = actionEditService;
        _globalSubProgramVariableEditService = globalSubProgramVariableEditService;
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
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return InvokeOnDispatcherAsync(
            () => Task.FromResult(_actionSearchService.SearchActions(query, maxCount)),
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
                var result = await _globalSubProgramVariableEditService
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
