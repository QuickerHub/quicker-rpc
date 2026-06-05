using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>Opens Quicker settings and related UI via <see cref="AppWindowManager"/> / <see cref="AppServer"/>.</summary>
internal static class QuickerSettingsUiAccessor
{
    private const string AppWindowManagerTypeName = "Quicker.Domain.Services.AppWindowManager";
    private const string SettingPageIdTypeName = "Quicker.Settings.Code.SettingPageId";

    private static readonly Lazy<MethodInfo?> ShowSettingsWindowMethod = new(ResolveShowSettingsWindowMethod);
    private static readonly Lazy<MethodInfo?> ShowSearchWindowMethod = new(ResolveShowSearchWindowMethod);
    private static readonly Lazy<MethodInfo?> ShowExeSettingsWindowMethod = new(ResolveShowExeSettingsWindowMethod);
    private static readonly Lazy<MethodInfo?> ShowConfigWindowMethod = new(ResolveShowConfigWindowMethod);
    private static readonly Lazy<Type?> SettingPageIdType = new(ResolveSettingPageIdType);

    public static bool TryOpenSettingsPage(string? pageId, out string? resolvedPageId, out string? error)
    {
        resolvedPageId = null;
        error = null;

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var method = ShowSettingsWindowMethod.Value;
        var pageIdType = SettingPageIdType.Value;
        if (method is null || pageIdType is null)
        {
            error = "AppWindowManager.ShowSettingsWindow unavailable.";
            return false;
        }

        object? pageArg = null;
        if (!string.IsNullOrWhiteSpace(pageId))
        {
            if (!TryParseSettingPageId(pageId.Trim(), pageIdType, out var parsed, out error))
            {
                return false;
            }

            resolvedPageId = parsed;
            pageArg = CreateNullableEnum(pageIdType, Enum.Parse(pageIdType, parsed!, ignoreCase: true));
        }

        try
        {
            method.Invoke(null, new[] { pageArg });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryOpenSearchWindow(string? searchText, out string? error)
    {
        error = null;
        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var method = ShowSearchWindowMethod.Value;
        if (method is null)
        {
            error = "AppServer.ShowSearchWindow unavailable.";
            return false;
        }

        try
        {
            method.Invoke(AppState.AppServer, new object?[] { searchText ?? string.Empty, false });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryOpenExeSettingsWindow(string exeFile, out string? error)
    {
        error = null;
        var exe = (exeFile ?? string.Empty).Trim();
        if (exe.Length == 0)
        {
            error = "exeFile is required for exe-settings.";
            return false;
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var method = ShowExeSettingsWindowMethod.Value;
        if (method is null)
        {
            error = "AppServer.ShowExeSettingsWindow unavailable.";
            return false;
        }

        try
        {
            method.Invoke(AppState.AppServer, new object[] { exe });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryOpenConfigWindow(out string? error)
    {
        error = null;
        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var method = ShowConfigWindowMethod.Value;
        if (method is null)
        {
            return TryOpenSettingsPage(null, out _, out error);
        }

        try
        {
            method.Invoke(AppState.AppServer, null);
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryParseSettingPageId(string text, out string? pageId, out string? error) =>
        TryParseSettingPageId(text, SettingPageIdType.Value, out pageId, out error);

    public static IReadOnlyList<string> ListSettingPageIds()
    {
        var pageIdType = SettingPageIdType.Value;
        if (pageIdType is null || !pageIdType.IsEnum)
        {
            return Array.Empty<string>();
        }

        return Enum.GetNames(pageIdType)
            .Where(name => !string.Equals(name, "Invalid", StringComparison.OrdinalIgnoreCase))
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool TryParseSettingPageId(
        string text,
        Type? pageIdType,
        out string? pageId,
        out string? error)
    {
        pageId = null;
        error = null;
        if (pageIdType is null || !pageIdType.IsEnum)
        {
            error = "SettingPageId type unavailable.";
            return false;
        }

        foreach (var name in Enum.GetNames(pageIdType))
        {
            if (string.Equals(name, text, StringComparison.OrdinalIgnoreCase))
            {
                pageId = name;
                return true;
            }
        }

        error = $"Unknown settings page: {text}";
        return false;
    }

    private static object CreateNullableEnum(Type enumType, object value)
    {
        var nullableType = typeof(Nullable<>).MakeGenericType(enumType);
        return Activator.CreateInstance(nullableType, value)!;
    }

    private static Type? ResolveSettingPageIdType()
    {
        var assembly = ResolveQuickerAssembly();
        return QuickerAssemblyReflection.TryGetTypeByFullName(assembly, SettingPageIdTypeName);
    }

    private static MethodInfo? ResolveShowSettingsWindowMethod()
    {
        var assembly = ResolveQuickerAssembly();
        var managerType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, AppWindowManagerTypeName);
        var pageIdType = SettingPageIdType.Value;
        if (managerType is null || pageIdType is null)
        {
            return null;
        }

        var nullableType = typeof(Nullable<>).MakeGenericType(pageIdType);
        return managerType
            .GetMethods(QuickerAssemblyReflection.StaticFlags)
            .SingleOrDefault(method =>
                method.IsStatic
                && method.Name == "ShowSettingsWindow"
                && method.ReturnType == typeof(void)
                && method.GetParameters().Length == 1
                && method.GetParameters()[0].ParameterType == nullableType);
    }

    private static MethodInfo? ResolveShowSearchWindowMethod()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        return AppState.AppServer.GetType().GetMethod(
            "ShowSearchWindow",
            QuickerAssemblyReflection.InstanceFlags,
            binder: null,
            types: new[] { typeof(string), typeof(bool) },
            modifiers: null);
    }

    private static MethodInfo? ResolveShowExeSettingsWindowMethod()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        return AppState.AppServer.GetType().GetMethod(
            "ShowExeSettingsWindow",
            QuickerAssemblyReflection.InstanceFlags,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
    }

    private static MethodInfo? ResolveShowConfigWindowMethod()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        return AppState.AppServer.GetType().GetMethod(
            "ShowConfigWindow",
            QuickerAssemblyReflection.InstanceFlags,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
    }

    private static Assembly ResolveQuickerAssembly()
    {
        if (QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var quicker))
        {
            return quicker;
        }

        return typeof(AppState).Assembly;
    }
}
