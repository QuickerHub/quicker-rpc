using System.Runtime.CompilerServices;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin;

internal static class PluginModuleInitializer
{
    [ModuleInitializer]
    internal static void Initialize()
    {
        PluginCosturaAssemblyResolve.EnsureRegistered();
        PluginAssemblyResolve.EnsureRegistered();
        InitializeDiagnostics();
    }

    // Register before the JIT resolves the first private Transport reference.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void InitializeDiagnostics()
    {
        TransportDiagnostics.Sink = static (message, ex) => PluginV2DiagnosticLog.Write(message, ex);
    }
}
