using System;
using System.Runtime.CompilerServices;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

/// <summary>One per plugin bootstrap; independent of individual services and pipe connections.</summary>
public sealed class QuickerRpcHostSessionScope
{
    private static readonly ConditionalWeakTable<IQuickerRpcHost, QuickerRpcHostSessionScope> CompatibilityScopes = new();

    public string Id { get; } = Guid.NewGuid().ToString("N");

    // Existing manually constructed services share their host object's lifetime.
    internal static QuickerRpcHostSessionScope ForHost(IQuickerRpcHost host) =>
        CompatibilityScopes.GetValue(host, _ => new QuickerRpcHostSessionScope());
}
