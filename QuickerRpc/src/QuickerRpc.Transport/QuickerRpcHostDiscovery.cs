using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport;

public sealed class QuickerRpcHostSelection
{
    public string? HostSessionId { get; set; }
    public IReadOnlyList<string> RequiredCapabilities { get; set; } = Array.Empty<string>();
    /// <summary>Explicit endpoint scope, also used by isolated fixtures. Never a disk registry.</summary>
    public IReadOnlyList<string>? CandidateEndpoints { get; set; }
    public int HandshakeTimeoutMilliseconds { get; set; } = 750;
}

public static class QuickerRpcHostDiscovery
{
    private const int MaxCandidates = 64;

    public static IReadOnlyList<string> EnumerateEndpoints()
    {
        var windows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        var root = windows ? @"\\.\pipe\" : Path.GetTempPath();
        var filePrefix = windows ? "" : "CoreFxPipe_";
        return Directory.EnumerateFiles(root, filePrefix + QuickerRpcEndpointNames.CurrentUserPrefix + "*")
            .Select(Path.GetFileName).Where(n => n is not null)
            .Select(n => n!.Substring(filePrefix.Length))
            .Where(QuickerRpcEndpointNames.IsCurrentUserEndpoint).Take(MaxCandidates + 1).ToArray();
    }

    public static async Task<IReadOnlyList<QuickerRpcHostBinding>> DiscoverAsync(
        QuickerRpcHostSelection? selection = null, CancellationToken cancellationToken = default)
    {
        selection ??= new QuickerRpcHostSelection();
        cancellationToken.ThrowIfCancellationRequested();
        var scope = selection.CandidateEndpoints ?? (string.IsNullOrWhiteSpace(selection.HostSessionId)
            ? EnumerateEndpoints() : new[] { QuickerRpcEndpointNames.ForSession(selection.HostSessionId!) });
        var endpoints = scope.Distinct(StringComparer.Ordinal).ToArray();
        if (endpoints.Length > MaxCandidates)
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.Ambiguous, "Too many host endpoints. Restrict the candidate scope explicitly.");
        var found = new List<QuickerRpcHostBinding>();
        // All handshakes share one deadline, including unresponsive candidates.
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(Math.Max(1, Math.Min(5000, selection.HandshakeTimeoutMilliseconds)));
        var probes = endpoints.Select(async endpoint =>
        {
            if (!QuickerRpcEndpointNames.IsCurrentUserEndpoint(endpoint)) return null;
            try
            {
                await using var session = await QuickerRpcClient.ConnectEndpointAsync(endpoint, null, deadline.Token).ConfigureAwait(false);
                return session.Binding;
            }
            catch (Exception) when (!cancellationToken.IsCancellationRequested) { return null; }
        }).ToArray();
        var results = await Task.WhenAll(probes).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        foreach (var binding in results)
            if (binding is not null && selection.RequiredCapabilities.All(binding.Supports)) found.Add(binding);
        return found.OrderBy(b => b.HostSessionId, StringComparer.Ordinal).ToArray();
    }

    public static QuickerRpcHostBinding Select(IReadOnlyList<QuickerRpcHostBinding> candidates, string? sessionId)
    {
        var matches = candidates.Where(b => string.IsNullOrWhiteSpace(sessionId) || b.HostSessionId == sessionId).ToArray();
        if (matches.Length == 1) return matches[0];
        if (matches.Length == 0)
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.Unavailable, "No compatible host is available for the requested session.");
        throw new QuickerRpcClientException(QuickerRpcBindingErrors.Ambiguous,
            "Multiple compatible hosts. Select --host-session <session> (or QKRPC_HOST_SESSION).",
            matches.Select(b => b.HostSessionId + " " + b.HostKind + " " + b.QuickerVersion).ToArray());
    }

    internal static QuickerRpcHostBinding Verify(QuickerRpcHostSessionInfo? info, string endpoint)
    {
        if (info is null || info.Service != "qkrpc" || info.SchemaVersion != 1 || info.ProtocolVersion != 1
            || string.IsNullOrWhiteSpace(info.HostInstanceId) || !Guid.TryParseExact(info.HostSessionId, "N", out _)
            || info.Endpoint != endpoint || endpoint != QuickerRpcEndpointNames.ForSession(info.HostSessionId)
            || !QuickerRpcEndpointNames.IsCurrentUserEndpoint(endpoint)
            || (info.Host?.Kind != "v1" && info.Host?.Kind != "v2") || info.Capabilities is null)
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.InvalidHandshake, "Host identity, endpoint or protocol was not verified.");
        return new QuickerRpcHostBinding(info.HostInstanceId, info.HostSessionId, endpoint, info.ProtocolVersion,
            info.SchemaVersion, info.Host.Kind, info.Host.QuickerVersion, new Dictionary<string, bool>(info.Capabilities));
    }
}
