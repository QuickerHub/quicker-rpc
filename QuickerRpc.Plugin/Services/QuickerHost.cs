using System.Reflection;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerHost
{
    public static bool IsRunningInQuicker()
    {
        return Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
    }
}
