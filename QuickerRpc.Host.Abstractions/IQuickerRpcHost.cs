namespace QuickerRpc.Host;

/// <summary>
/// Root host surface for QuickerRpc plugin adapters.
/// One implementation is registered per Quicker process (V1 or V2, never both).
/// </summary>
public interface IQuickerRpcHost
{
    QuickerRpcHostInfo Info { get; }

    IQuickerRpcActionProgramHost ActionPrograms { get; }

    IQuickerRpcActionSharingHost ActionSharing { get; }
}
