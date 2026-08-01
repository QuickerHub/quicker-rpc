using System;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Services;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin.V2.Adapters;

/// <summary>
/// Run local actions via shared <see cref="ActionRunService"/> reflection;
/// trace via V2 <see cref="V2XActionTraceRunService"/>.
/// </summary>
internal sealed class V2ActionRunHost : IQuickerRpcActionRunHost
{
    private readonly ActionRunService _run = new();
    private readonly V2XActionTraceRunService _trace = new();

    public Task<QuickerRpcActionRunResult> RunAsync(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_run.RunAction(actionId, inputParam, enableDebugging, waitForComplete));
    }

    public Task<QuickerRpcActionTraceRunResult> RunTraceAsync(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var streamCallbacks = QuickerRpcTraceSink.CurrentClientCallbacks;
        return Task.FromResult(_trace.RunAction(actionId, inputParam, progress, streamCallbacks));
    }

    public Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var streamCallbacks = QuickerRpcTraceSink.CurrentClientCallbacks;
        return Task.FromResult(_trace.RunXAction(xActionJson, inputParam, progress, streamCallbacks));
    }

    public Task<QuickerRpcFloatActionResult> FloatAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                Message = "actionId is required.",
            });
        }

        var accessor = QuickerV2ActionAccessor.Current;
        object? action = null;
        string? resolveError = null;
        if (accessor is null || !accessor.TryGetById(id, out action, out resolveError) || action is null)
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = resolveError ?? "Quicker V2 action services unavailable.",
            });
        }

        var owner = Application.Current?.MainWindow;
        if (owner is null)
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = "No WPF main window available for FloatAction.",
            });
        }

        var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.FloatActionService);
        var service = serviceType is null ? null : QuickerV2Runtime.TryGetService(serviceType);
        var floatAction = serviceType?.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(method => method.Name == "FloatAction" && method.GetParameters().Length == 2);
        if (service is null || floatAction is null)
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = "Quicker V2 FloatActionService.FloatAction unavailable.",
            });
        }

        try
        {
            void Show() => floatAction.Invoke(service, [action, owner]);
            if (owner.Dispatcher.CheckAccess())
            {
                Show();
            }
            else
            {
                owner.Dispatcher.Invoke(Show);
            }

            var title = accessor.GetPresentation(action).Title;
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = true,
                ActionId = accessor.GetActionId(action),
                ActionTitle = title,
                Message = string.IsNullOrWhiteSpace(title)
                    ? "动作已显示为悬浮按钮。"
                    : $"动作已显示为悬浮按钮：{title}",
            });
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = ex.InnerException.Message,
            });
        }
        catch (Exception ex)
        {
            return Task.FromResult(new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = ex.Message,
            });
        }
    }
}
