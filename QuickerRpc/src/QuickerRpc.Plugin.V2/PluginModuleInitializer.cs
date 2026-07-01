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
        TransportDiagnostics.Sink = static (message, ex) => PluginV2DiagnosticLog.Write(message, ex);
    }
}
