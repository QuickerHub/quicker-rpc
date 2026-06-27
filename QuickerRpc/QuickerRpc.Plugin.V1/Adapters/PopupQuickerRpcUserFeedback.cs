using QuickerRpc.Host;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class PopupQuickerRpcUserFeedback : IQuickerRpcUserFeedback
{
    private readonly IPopupMessageService _popup;

    public PopupQuickerRpcUserFeedback(IPopupMessageService popup)
    {
        _popup = popup;
    }

    public void Success(string message) => _popup.Success(message);

    public void Error(string message) => _popup.Error(message);
}
