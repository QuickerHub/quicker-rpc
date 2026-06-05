using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Entities;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>Read/write Quicker user settings via <see cref="RuntimeDataStore"/> and <c>SQLDataMgr</c>.</summary>
internal static class QuickerSettingsAccessor
{
    private const string RuntimeDataStoreTypeName = "Quicker.Domain.Services.Data.RuntimeDataStore";

    private static readonly Lazy<Type?> UserSettingsType = new(ResolveUserSettingsType);
    private static readonly Lazy<Type?> UserPreferenceType = new(() => typeof(UserPreference));
    private static readonly Lazy<Type?> ExeSettingsType = new(() => typeof(ExeSettings));

    public static bool TryGetUserSettings(out object? settings, out string? error)
    {
        settings = null;
        error = null;

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        if (TryGetUserSettingsFromDataService(out settings))
        {
            return true;
        }

        if (TryGetRuntimeDataStore(out var store, out var storeType, out error) && store is not null && storeType is not null)
        {
            var property = storeType.GetProperty("UserSettings", QuickerAssemblyReflection.InstanceFlags);
            if (property is not null)
            {
                try
                {
                    settings = property.GetValue(store);
                    if (settings is not null)
                    {
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    error = ex.Message;
                    return false;
                }
            }
        }

        error ??= "UserSettings unavailable.";
        return false;
    }

    public static bool TryGetUserPreference(out object? preference, out string? error)
    {
        preference = null;
        error = null;

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        try
        {
            var property = typeof(AppState).GetProperty("UserPreference", QuickerAssemblyReflection.StaticFlags);
            if (property is null)
            {
                error = "AppState.UserPreference unavailable.";
                return false;
            }

            preference = property.GetValue(null);
            return preference is not null;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TrySaveUserSettings(object settings, out string? error)
    {
        error = null;
        if (!TryInvokeSqlDataMgrVoid(settings, UserSettingsType.Value, out error))
        {
            return false;
        }

        TryNotifyUserSettingsChange(settings);
        return true;
    }

    public static bool TrySaveUserPreference(object preference, out string? error)
    {
        error = null;
        if (!TryInvokeSqlDataMgrVoid(preference, UserPreferenceType.Value, out error))
        {
            return false;
        }

        return true;
    }

    public static bool TryGetGlobalSettingsKeys(out IReadOnlyList<string> keys, out string? error)
    {
        keys = Array.Empty<string>();
        error = null;

        if (!TryGetUserSettings(out var settings, out error) || settings is null)
        {
            return false;
        }

        var property = settings.GetType().GetProperty("GlobalSettings", QuickerAssemblyReflection.InstanceFlags);
        if (property?.GetValue(settings) is not IDictionary dict)
        {
            error = "UserSettings.GlobalSettings unavailable.";
            return false;
        }

        keys = dict.Keys.Cast<object?>()
            .Select(key => key?.ToString() ?? string.Empty)
            .Where(key => key.Length > 0)
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return true;
    }

    public static bool TryGetExeSettings(string exeFile, out ExeSettings? settings, out string? error) =>
        ExeSettingsAccessor.TryGetExeSettings(exeFile, out settings, out error);

    public static bool TrySaveExeSettings(ExeSettings settings, out string? error) =>
        ExeSettingsAccessor.TrySaveExeSettings(settings, out error);

    public static Type? ResolveCatalogType(string scope) =>
        scope switch
        {
            QuickerSettingsScopes.UserSettings => UserSettingsType.Value,
            QuickerSettingsScopes.UserPreference => UserPreferenceType.Value,
            QuickerSettingsScopes.ExeSettings => ExeSettingsType.Value,
            _ => null,
        };

    private static bool TryGetUserSettingsFromDataService(out object? settings)
    {
        settings = null;
        var dataService = AppState.DataService;
        if (dataService is null)
        {
            return false;
        }

        var userSettingsType = UserSettingsType.Value;
        if (userSettingsType is null)
        {
            return false;
        }

        foreach (var field in dataService.GetType().GetFields(QuickerAssemblyReflection.InstanceFlags))
        {
            if (field.FieldType != userSettingsType)
            {
                continue;
            }

            try
            {
                if (field.GetValue(dataService) is { } value)
                {
                    settings = value;
                    return true;
                }
            }
            catch
            {
                // Try the next candidate field.
            }
        }

        return false;
    }

    private static bool TryGetRuntimeDataStore(out object? store, out Type? storeType, out string? error)
    {
        store = null;
        storeType = null;
        error = null;

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var assembly = ResolveQuickerAssembly();
        storeType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, RuntimeDataStoreTypeName);
        if (storeType is null)
        {
            error = "RuntimeDataStore type unavailable.";
            return false;
        }

        store = TryGetRuntimeDataStoreInstance(storeType);
        if (store is null)
        {
            error = "RuntimeDataStore instance unavailable.";
            return false;
        }

        return true;
    }

    private static object? TryGetRuntimeDataStoreInstance(Type runtimeType)
    {
        foreach (var storeMethod in runtimeType
                     .GetMethods(QuickerAssemblyReflection.StaticFlags)
                     .Where(method =>
                         method.IsStatic
                         && method.ReturnType == runtimeType
                         && method.GetParameters().Length == 0))
        {
            try
            {
                if (storeMethod.Invoke(null, null) is { } storeFromMethod)
                {
                    return storeFromMethod;
                }
            }
            catch
            {
                // Try the next candidate accessor.
            }
        }

        foreach (var storeField in runtimeType
                     .GetFields(QuickerAssemblyReflection.StaticFlags)
                     .Where(field => field.IsStatic && field.FieldType == runtimeType))
        {
            try
            {
                if (storeField.GetValue(null) is { } storeFromField)
                {
                    return storeFromField;
                }
            }
            catch
            {
                // Try the next candidate accessor.
            }
        }

        return null;
    }

    private static bool TryInvokeSqlDataMgrVoid(object payload, Type? expectedParameterType, out string? error)
    {
        error = null;
        if (expectedParameterType is null)
        {
            error = "Settings type unavailable.";
            return false;
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var dataService = AppState.DataService;
        if (dataService is null)
        {
            error = "DataService unavailable.";
            return false;
        }

        var sqlField = dataService.GetType()
            .GetFields(QuickerAssemblyReflection.InstanceFlags)
            .FirstOrDefault(field => field.FieldType.Name == "SQLDataMgr");
        if (sqlField is null)
        {
            error = "SQLDataMgr field unavailable.";
            return false;
        }

        object? sqlMgr;
        try
        {
            sqlMgr = sqlField.GetValue(dataService);
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }

        if (sqlMgr is null)
        {
            error = "SQLDataMgr instance unavailable.";
            return false;
        }

        var saveMethod = sqlMgr.GetType()
            .GetMethods(QuickerAssemblyReflection.InstanceFlags)
            .SingleOrDefault(method =>
                !method.IsSpecialName
                && method.ReturnType == typeof(void)
                && method.GetParameters().Length == 1
                && method.GetParameters()[0].ParameterType == expectedParameterType);

        if (saveMethod is null)
        {
            error = $"SQLDataMgr save method for {expectedParameterType.Name} unavailable.";
            return false;
        }

        try
        {
            saveMethod.Invoke(sqlMgr, new[] { payload });
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

    private static void TryNotifyUserSettingsChange(object settings)
    {
        try
        {
            var assembly = ResolveQuickerAssembly();
            var hubExtensionType = QuickerAssemblyReflection.TryGetTypeByFullName(
                assembly,
                "Quicker.Domain.Messages.HubExtension");
            if (hubExtensionType is null)
            {
                return;
            }

            var notifyMethod = hubExtensionType
                .GetMethods(QuickerAssemblyReflection.StaticFlags)
                .FirstOrDefault(method =>
                    method.IsStatic
                    && method.Name == "NotifyUserSettingsChange"
                    && method.GetParameters().Length == 2);
            if (notifyMethod is null)
            {
                return;
            }

            var hub = TryResolveMessengerHub(assembly);
            if (hub is null)
            {
                return;
            }

            notifyMethod.Invoke(null, new[] { hub, settings });
        }
        catch
        {
            // Best-effort UI refresh after persistence.
        }
    }

    private static object? TryResolveMessengerHub(Assembly assembly)
    {
        var hubType = assembly.GetTypes()
            .FirstOrDefault(type => type.Name == "ITinyMessengerHub" && type.IsInterface);
        if (hubType is null)
        {
            return null;
        }

        foreach (var root in new object?[] { AppState.AppServer, AppState.DataService })
        {
            if (root is null)
            {
                continue;
            }

            var property = root.GetType()
                .GetProperties(QuickerAssemblyReflection.InstanceFlags)
                .FirstOrDefault(item => hubType.IsAssignableFrom(item.PropertyType));
            if (property is null)
            {
                continue;
            }

            try
            {
                if (property.GetValue(root) is { } hub)
                {
                    return hub;
                }
            }
            catch
            {
                // Try the next root object.
            }
        }

        return null;
    }

    private static Type? ResolveUserSettingsType()
    {
        var assembly = ResolveQuickerAssembly();
        var runtimeType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, RuntimeDataStoreTypeName);
        var property = runtimeType?.GetProperty("UserSettings", QuickerAssemblyReflection.InstanceFlags);
        return property?.PropertyType;
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

internal static class QuickerSettingsScopes
{
    public const string UserSettings = "userSettings";

    public const string UserPreference = "userPreference";

    public const string GlobalSettings = "globalSettings";

    public const string ExeSettings = "exeSettings";
}
