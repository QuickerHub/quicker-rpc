using QuickerRpc.Host;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2QuickerRpcHostCapabilities : IQuickerRpcHostCapabilities
{
    internal static V2QuickerRpcHostCapabilities Instance { get; } = new();

    public bool ChromeControl => false;

    public bool Triggers => false;

    public bool DesignerUi => false;

    public bool Launcher => false;

    public bool EnforcesDesignerOpenGuard => true;
}
