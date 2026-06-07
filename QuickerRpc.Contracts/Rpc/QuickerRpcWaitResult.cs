namespace QuickerRpc.Contracts.Rpc;

public sealed class QuickerRpcWaitResult
{
    public string Pong { get; set; } = string.Empty;

    public int ProtocolVersion { get; set; }

    public int ElapsedMs { get; set; }

    public int Attempts { get; set; }

    public bool BootstrapAttempted { get; set; }
}
