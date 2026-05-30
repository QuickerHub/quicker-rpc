using System;

namespace QuickerRpc.Plugin.Quicker;

/// <summary>
/// Popup contract for Quicker toast messages (ported from IntelliTools.Quicker).
/// </summary>
public interface IPopupMessageService
{
    void Success(string message);
    void Infomation(string message);
    void Warning(string message);
    void Error(string message, Exception? exception = null);
}
