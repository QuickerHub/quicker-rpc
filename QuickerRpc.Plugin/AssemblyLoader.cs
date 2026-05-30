using Z.Expressions;

namespace QuickerRpc.Plugin;

/// <summary>
/// Quicker expression registration entry (load this type from a Quicker action).
/// </summary>
public static class AssemblyLoader
{
    /// <summary>
    /// Registers the launcher type and starts the RPC server when Quicker loads the plugin.
    /// </summary>
    public static bool Register(EvalContext eval)
    {
        eval.RegisterType(typeof(Launcher));
        Launcher.EnsureStarted();
        return true;
    }
}
