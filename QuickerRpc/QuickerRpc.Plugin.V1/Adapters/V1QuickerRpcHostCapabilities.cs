using QuickerRpc.Host;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1QuickerRpcHostCapabilities : IQuickerRpcHostCapabilities
{
    internal static V1QuickerRpcHostCapabilities Instance { get; } = new();

    public bool ChromeControl => true;

    public bool Triggers => true;

    public bool DesignerUi => true;

    public bool Launcher => true;

    public bool EnforcesDesignerOpenGuard => true;
}
