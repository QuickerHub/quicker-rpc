namespace QuickerRpc.Host;

/// <summary>Reports optional host ports and behavioral flags for the current Quicker process.</summary>
public interface IQuickerRpcHostCapabilities
{
    bool ChromeControl { get; }

    bool Triggers { get; }

    bool DesignerUi { get; }

    bool Launcher { get; }

    /// <summary>When true, headless program writes must refuse if Action Designer has the entity open.</summary>
    bool EnforcesDesignerOpenGuard { get; }
}
