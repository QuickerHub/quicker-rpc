using System;
using System.Linq;
using System.Reflection;

namespace QuickerRpc.Plugin.Quicker;

/// <summary>Minimal AppHelper reflection helpers used by the plugin.</summary>
internal static class QuickerAppHelperAccess
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

    public static void TryOpenUrlOrFile(string pathOrUrl)
    {
        var type = AppHelperType.Value;
        if (type is null || string.IsNullOrWhiteSpace(pathOrUrl))
        {
            return;
        }

        var method = type.GetMethod(
            "TryOpenUrlOrFile",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
        if (method is null)
        {
            return;
        }

        try
        {
            method.Invoke(null, new object[] { pathOrUrl.Trim() });
        }
        catch
        {
            // Suppress reflection errors so the host does not crash.
        }
    }
}
