using System.Collections.Generic;

namespace QuickerRpc.Transport;

/// <summary>
/// Named pipe identifiers for QuickerRpc JSON-RPC (plugin hosts server; CLI connects as client).
/// </summary>
public static class QuickerRpcPipeNames
{
    private const string Vid = "QRPC2026";

    /// <summary>Single duplex pipe: plugin hosts server; external CLI connects once.</summary>
    public static string ServerPipe { get; } = BuildPipeName("Server");

    private static string BuildPipeName(params string[] parts)
    {
        var list = new List<string> { "QuickerRpc" };
        list.AddRange(parts);
        list.Add(Vid);
        return string.Join("_", list);
    }
}
