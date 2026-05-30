using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// JSON-RPC surface exposed by the QuickerRpc plugin (StreamJsonRpc over named pipe).
/// </summary>
public interface IQuickerRpcService
{
    /// <summary>Echo check for connectivity.</summary>
    Task<string> PingAsync(CancellationToken cancellationToken = default);

    /// <summary>Bump when breaking RPC contract changes.</summary>
    Task<int> GetProtocolVersionAsync(CancellationToken cancellationToken = default);

    /// <summary>Upload / refresh a shared action in Quicker (same as ActionEditMgr.UpdateSharedActionAsync).</summary>
    Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default);
}

public sealed class QuickerRpcActionUpdateResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }
}
