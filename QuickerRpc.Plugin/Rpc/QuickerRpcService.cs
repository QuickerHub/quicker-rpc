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
    private readonly IPopupMessageService _popup;

    public QuickerRpcService(ActionUpdateService actionUpdateService, IPopupMessageService popup)
    {
        _actionUpdateService = actionUpdateService;
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
