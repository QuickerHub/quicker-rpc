using System;

namespace QuickerRpc.Plugin.Quicker;

/// <summary>
/// Static toast helpers. Works without DI; uses the same instance as <see cref="AppServices"/> when initialized.
/// </summary>
public static class PopupMessage
{
    /// <summary>Standalone instance for use before or outside the launcher host.</summary>
    public static readonly IPopupMessageService Default = new QuickerMessageService();

    private static IPopupMessageService Current =>
        AppServices.IsInitialized
            ? AppServices.GetRequired<IPopupMessageService>()
            : Default;

    public static void Success(string message) => Current.Success(message);

    public static void Infomation(string message) => Current.Infomation(message);

    public static void InformationWithClick(string message, Action onClick) =>
        Current.InformationWithClick(message, onClick);

    public static void Warning(string message) => Current.Warning(message);

    public static void Error(string message, Exception? exception = null) =>
        Current.Error(message, exception);
}
