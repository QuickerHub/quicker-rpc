using System.Collections;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Threading;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.V2.Reflection;

internal interface IV2StepRunnerInputContractNativePort
{
    bool IsAvailable { get; }
    Task<StepRunnerCatalog> ReadDefinitionAsync(string key, CancellationToken token);
}

/// <summary>Reads one current native runner on the existing UI dispatcher, without a catalog cache or service bootstrap.</summary>
internal sealed class V2StepRunnerInputContractNativePort : IV2StepRunnerInputContractNativePort
{
    private const string RunnerType = "Quicker.Domain.Actions.X.StepRunners.IStepRunner";
    private readonly Func<Binding?> _binding;
    private readonly Func<bool> _hasDispatcher;
    private readonly Func<Func<StepRunnerCatalog>, CancellationToken, Task<StepRunnerCatalog>> _dispatch;

    internal V2StepRunnerInputContractNativePort() : this(
        () => QuickerV2Runtime.IsRunningInQuicker ? Binding.TryCreate(
            FindLoadedType(QuickerV2TypeNames.StorageActionStep), FindLoadedType(QuickerV2TypeNames.IStepRunnerService), FindLoadedType(RunnerType)) : null,
        () => Application.Current?.Dispatcher is { HasShutdownStarted: false, HasShutdownFinished: false }, DispatchAsync) { }

    internal V2StepRunnerInputContractNativePort(Func<Binding?> binding, Func<bool> hasDispatcher,
        Func<Func<StepRunnerCatalog>, CancellationToken, Task<StepRunnerCatalog>> dispatch)
    { _binding = binding; _hasDispatcher = hasDispatcher; _dispatch = dispatch; }

    public bool IsAvailable
    {
        get { try { return _hasDispatcher() && _binding()?.HasCurrentService == true; } catch { return false; } }
    }

    public async Task<StepRunnerCatalog> ReadDefinitionAsync(string key, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var binding = _binding();
        var available = binding is not null && _hasDispatcher() && binding.HasCurrentService;
        token.ThrowIfCancellationRequested();
        if (!available) throw new NotSupportedException("The current native step runner service or Quicker UI dispatcher is unavailable.");
        var pending = _dispatch(() =>
        {
            token.ThrowIfCancellationRequested();
            var runner = binding!.ReadRunner(key);
            token.ThrowIfCancellationRequested();
            var definition = runner is null ? null : QuickerV2StepRunnerMapper.MapRunner(runner, captureInputPolicy: true);
            token.ThrowIfCancellationRequested();
            return new StepRunnerCatalog { Items = definition is null ? [] : [definition] };
        }, token);
        // The native synchronous getter may already be running; observe faults after cancellation but never publish late facts.
        _ = pending.ContinueWith(task => { _ = task.Exception; }, CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        var result = await pending.WaitAsync(token).ConfigureAwait(false);
        token.ThrowIfCancellationRequested();
        return result;
    }

    internal static Type? FindLoadedType(string name, IEnumerable<Assembly>? loaded = null)
    {
        if (name != RunnerType && name != QuickerV2TypeNames.StorageActionStep && name != QuickerV2TypeNames.IStepRunnerService) return null;
        foreach (var assembly in loaded ?? AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                if (assembly.IsDynamic || assembly.GetName().Name != "Quicker.StepEngine") continue;
                var type = assembly.GetType(name, throwOnError: false, ignoreCase: false);
                if (type is not null) return type;
            }
            catch { }
        }
        return null;
    }

    internal static Task<StepRunnerCatalog> DispatchAsync(Func<StepRunnerCatalog> work, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.HasShutdownStarted || dispatcher.HasShutdownFinished)
            throw new NotSupportedException("The Quicker UI dispatcher is unavailable.");
        return dispatcher.CheckAccess() ? Task.FromResult(work()) : dispatcher.InvokeAsync(work, DispatcherPriority.Normal, token).Task;
    }

    internal sealed class Binding
    {
        private readonly PropertyInfo _service;
        private readonly MethodInfo _getRunner;
        private Binding(PropertyInfo service, MethodInfo getRunner) { _service = service; _getRunner = getRunner; }
        public bool HasCurrentService => _service.GetValue(null) is { } service && _service.PropertyType.IsInstanceOfType(service);

        internal static Binding? TryCreate(Type? storage, Type? service, Type? runner)
        {
            if (storage is null || service is null || runner is null) return null;
            var property = storage.GetProperty("StepRunnerService", BindingFlags.Public | BindingFlags.Static);
            var method = service.GetMethod("GetRunner", BindingFlags.Public | BindingFlags.Instance, null, [typeof(string)], null);
            var inputs = runner.GetProperty("InputParams");
            var key = runner.GetProperty("Key");
            if (property?.PropertyType != service || property.GetMethod is not { IsPublic: true, IsStatic: true }
                || property.GetIndexParameters().Length != 0 || method is null || method.ContainsGenericParameters || method.ReturnType != runner
                || key?.PropertyType != typeof(string) || key.GetMethod is not { IsPublic: true, IsStatic: false } || key.GetIndexParameters().Length != 0
                || inputs?.GetMethod is not { IsPublic: true, IsStatic: false } || inputs.GetIndexParameters().Length != 0
                || !typeof(IEnumerable).IsAssignableFrom(inputs.PropertyType) || inputs.PropertyType == typeof(string)) return null;
            return new Binding(property, method);
        }

        internal object? ReadRunner(string key)
        {
            // ActionStep.StepRunnerService is the already-created runtime owner. Do not resolve DI or instantiate a replacement.
            var current = _service.GetValue(null);
            if (current is null || !_service.PropertyType.IsInstanceOfType(current)) throw new NotSupportedException("The native step runner service is not initialized.");
            try { return _getRunner.Invoke(current, [key]); }
            catch (TargetInvocationException error) when (error.InnerException is not null)
            { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); throw; }
        }
    }
}
