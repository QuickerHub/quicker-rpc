using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Integration;

namespace QuickerRpc.Console.ActionRuntime;

/// <summary>
/// Single place to wire scripting runtime + optional module packs for runtime-check/run (matches ActionRuntimeRouting).
/// </summary>
internal static class ActionRuntimeExecutorFactory
{
    internal static ActionRuntimeExecutor Create(IHostServices? defaultHostServices = null)
    {
        defaultHostServices ??= NoopHostServices.Instance;
        var runtime = CreateRuntime();
        return new ActionRuntimeExecutor(runtime, defaultHostServices);
    }

    internal static IActionRuntime CreateRuntime()
    {
#if ACTION_RUNTIME_PACKS
        ActionRuntimeOptionalPacks.EnsureCatalogRegistered();
        return ActionRuntimeBootstrap.CreateScriptingRuntime(ActionRuntimeOptionalPacks.DefaultPacks.ToArray());
#else
        return ActionRuntimeBootstrap.CreateScriptingRuntime();
#endif
    }

    internal static IReadOnlyCollection<string> GetSupportedStepKeys()
    {
        return CreateRuntime().RegisteredStepKeys;
    }
}
