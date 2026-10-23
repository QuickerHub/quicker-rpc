using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Threading;
using Newtonsoft.Json;

namespace QuickerRpc.Plugin.V2.Reflection;

internal interface IV2DesignerSummaryNativePort
{
    bool IsAvailable { get; }
    Task<string> ReadSummariesJsonAsync(string requestJson, CancellationToken cancellationToken);
}

/// <summary>Invokes one readonly native leaf; never initializes the Headless bridge or its services.</summary>
internal sealed class V2DesignerSummaryNativePort : IV2DesignerSummaryNativePort
{
    private const string TypeName = "Quicker.Modules.Headless.HostAdapter.QuickerDesignerStepSummariesBatch";
    private readonly Func<string, object?> _compute;
    private readonly Func<bool> _isAvailable;
    private readonly Func<Func<string>, CancellationToken, Task<string>> _dispatch;

    internal V2DesignerSummaryNativePort() : this(InvokeNative,
        () => FindNativeCompute() is not null && HasDispatcher(), DispatchOnApplicationAsync) { }

    internal V2DesignerSummaryNativePort(Func<string, object?> compute, Func<bool> isAvailable,
        Func<Func<string>, CancellationToken, Task<string>> dispatch)
    { _compute = compute; _isAvailable = isAvailable; _dispatch = dispatch; }

    public bool IsAvailable => _isAvailable();

    public async Task<string> ReadSummariesJsonAsync(string requestJson, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var available = IsAvailable;
        cancellationToken.ThrowIfCancellationRequested();
        if (!available) throw new NotSupportedException("Native Designer summaries or the Quicker UI dispatcher are unavailable.");
        var pending = _dispatch(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = _compute(requestJson);
            cancellationToken.ThrowIfCancellationRequested();
            return JsonConvert.SerializeObject(result);
        }, cancellationToken);
        // Native work may already be running. Observe a late fault without delivering its result.
        _ = pending.ContinueWith(task => { _ = task.Exception; }, CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        var json = await pending.WaitAsync(cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        return json;
    }

    internal static MethodInfo? FindCompute(Type? type)
    {
        var method = type?.GetMethod("Compute", BindingFlags.Public | BindingFlags.Static,
            binder: null, types: [typeof(string)], modifiers: null);
        return method is not null && !method.ContainsGenericParameters && method.ReturnType != typeof(void) && !typeof(Task).IsAssignableFrom(method.ReturnType)
            ? method : null;
    }

    private static MethodInfo? FindNativeCompute() => QuickerV2Runtime.IsRunningInQuicker
        ? FindCompute(QuickerV2Runtime.ResolveType(TypeName)) : null;

    private static object? InvokeNative(string requestJson)
    {
        var method = FindNativeCompute() ?? throw new NotSupportedException("Native Designer summaries API is unavailable.");
        try { return method.Invoke(null, [requestJson]); }
        catch (TargetInvocationException error) when (error.InnerException is not null)
        { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); throw; }
    }

    private static bool HasDispatcher() => Application.Current?.Dispatcher is { HasShutdownStarted: false, HasShutdownFinished: false };

    internal static Task<string> DispatchOnApplicationAsync(Func<string> work, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.HasShutdownStarted || dispatcher.HasShutdownFinished)
            throw new NotSupportedException("The Quicker UI dispatcher is unavailable.");
        return dispatcher.CheckAccess() ? Task.FromResult(work())
            : dispatcher.InvokeAsync(work, DispatcherPriority.Normal, token).Task;
    }
}
