using System;
using System.Diagnostics;
using System.Linq;
using System.Reflection;

namespace QuickerRpc.Plugin.Quicker;

/// <summary>
/// Uses Quicker.Utilities.AppHelper when running inside Quicker (reflection; no hard reference).
/// </summary>
public sealed class QuickerMessageService : IPopupMessageService
{
    private static readonly Lazy<Type?> AppHelperType = new(() =>
    {
        var type = Type.GetType("Quicker.Utilities.AppHelper, Quicker", false);
        if (type is not null)
        {
            return type;
        }

        return AppDomain.CurrentDomain.GetAssemblies()
            .Select(a => a.GetType("Quicker.Utilities.AppHelper", false))
            .FirstOrDefault(t => t is not null);
    });

    private static void Invoke(string methodName, params object?[] args)
    {
        var type = AppHelperType.Value;
        if (type is null)
        {
            return;
        }

        var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Where(m => m.Name == methodName)
            .ToArray();

        MethodInfo? target = methods.FirstOrDefault(m => m.GetParameters().Length == args.Length);

        if (target is null)
        {
            target = methods.FirstOrDefault(m =>
                m.GetParameters().Length == 2 &&
                m.GetParameters()[0].ParameterType == typeof(string) &&
                m.GetParameters()[1].ParameterType == typeof(bool));

            if (target is not null)
            {
                args = new object?[] { args[0], false };
            }
        }

        if (target is null)
        {
            target = methods.FirstOrDefault(m =>
                m.GetParameters().Length == 3 &&
                m.GetParameters()[0].ParameterType == typeof(string));

            if (target is not null)
            {
                args = new object?[] { args[0], false, null };
            }
        }

        try
        {
            target?.Invoke(null, args);
        }
        catch
        {
            // Suppress reflection errors so the host does not crash.
        }
    }

    public void Success(string message) => Invoke("ShowSuccess", message);

    public void Infomation(string message) => Invoke("ShowInformation", message);

    public void InformationWithClick(string message, Action onClick) =>
        Invoke("ShowInformation", message, false, onClick);

    public void Warning(string message) => Invoke("ShowWarning", message);

    public void Error(string message, Exception? exception = null)
    {
        var fullMessage = $"{message}\n---------------\n内部错误：{exception?.Message}";
        Invoke("ShowError", fullMessage);
    }
}
