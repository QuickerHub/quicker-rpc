namespace QuickerRpc.Host;

/// <summary>Runtime identity reported by the loaded Quicker host adapter.</summary>
public sealed class QuickerRpcHostInfo
{
    public QuickerHostKind Kind { get; set; }

    /// <summary>Quicker application version string.</summary>
    public string QuickerVersion { get; set; } = string.Empty;

    /// <summary>Host adapter assembly simple name (e.g. Quicker.Infrastructure).</summary>
    public string AdapterAssembly { get; set; } = string.Empty;
}
