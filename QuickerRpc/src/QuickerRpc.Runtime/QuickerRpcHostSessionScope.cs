using System;
using System.Runtime.CompilerServices;
using System.Diagnostics;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

/// <summary>One per plugin bootstrap; independent of individual services and pipe connections.</summary>
public sealed class QuickerRpcHostSessionScope
{
    private static readonly ConditionalWeakTable<IQuickerRpcHost, QuickerRpcHostSessionScope> CompatibilityScopes = new();

    public string Id { get; } = Guid.NewGuid().ToString("N");

    public string InstanceId { get; } = GetInstanceId();
    public string Endpoint => QuickerRpcEndpointNames.ForSession(Id);

    private static string GetInstanceId()
    {
        using var process = Process.GetCurrentProcess();
        return process.Id + "-" + process.StartTime.ToUniversalTime().Ticks;
    }

    // Existing manually constructed services share their host object's lifetime.
    internal static QuickerRpcHostSessionScope ForHost(IQuickerRpcHost host) =>
        CompatibilityScopes.GetValue(host, _ => new QuickerRpcHostSessionScope());
}
