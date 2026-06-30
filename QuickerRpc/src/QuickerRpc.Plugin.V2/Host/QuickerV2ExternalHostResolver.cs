using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Host;

/// <summary>
/// Optional external <see cref="IQuickerRpcHost"/> from Quicker DI (future Infrastructure).
/// Reflection host is the default when this returns null.
/// </summary>
internal static class QuickerV2ExternalHostResolver
{
    public static IQuickerRpcHost? TryResolve()
    {
        try
        {
            var host = QuickerV2Runtime.TryGetService(typeof(IQuickerRpcHost)) as IQuickerRpcHost;
            if (host is null)
            {
                return null;
            }

            return host.Info.Kind == QuickerHostKind.V2 ? host : null;
        }
        catch
        {
            return null;
        }
    }
}
