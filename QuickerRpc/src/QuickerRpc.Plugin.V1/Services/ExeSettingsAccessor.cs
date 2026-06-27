using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Entities;

namespace QuickerRpc.Plugin.Services;

/// <summary>Read/write per-exe <see cref="ExeSettings"/> (virtual processes and real apps).</summary>
internal static class ExeSettingsAccessor
{
    private static readonly Lazy<MethodInfo?> GetExeSettingsMethod = new(ResolveGetExeSettingsMethod);
    private static readonly Lazy<MethodInfo?> GetExeSettingsDictMethod = new(ResolveGetExeSettingsDictMethod);

    public static bool TryGetExeSettings(string exeFile, out ExeSettings? settings, out string? error)
    {
        settings = null;
        error = null;

        var exe = (exeFile ?? string.Empty).Trim();
        if (exe.Length == 0)
        {
            error = "exeFile is required.";
            return false;
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var method = GetExeSettingsMethod.Value;
        if (method is null)
        {
            error = "DataService.GetExeSettings unavailable.";
            return false;
        }

        try
        {
            settings = method.Invoke(AppState.DataService, new object[] { exe, true }) as ExeSettings;
            return settings is not null;
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

    public static bool TrySaveExeSettings(ExeSettings settings, out string? error)
    {
        error = null;
        try
        {
            AppState.AppServer.SaveExeSettings(settings);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryEnsureVirtualExe(string exeFile, string displayName, out ExeSettings settings, out string? error)
    {
        settings = null!;
        error = null;

        var exe = (exeFile ?? string.Empty).Trim();
        if (exe.Length == 0)
        {
            error = "exeFile is required.";
            return false;
        }

        var name = string.IsNullOrWhiteSpace(displayName) ? exe : displayName.Trim();
        if (TryGetExeSettings(exe, out var existing, out _) && existing is not null)
        {
            settings = existing;
        }
        else
        {
            settings = new ExeSettings
            {
                Exe = exe,
                Name = name,
                Path = exe,
                ProfileList = new List<string>(),
            };
        }

        settings.Exe = exe;
        settings.Name = name;
        if (string.IsNullOrWhiteSpace(settings.Path))
        {
            settings.Path = exe;
        }

        if (settings.ProfileList is null)
        {
            settings.ProfileList = new List<string>();
        }

        // GetExeSettings may synthesize from profiles without persisting; SaveExeSettings upserts ExeSettingsDict.
        return TrySaveExeSettings(settings, out error);
    }

    public static bool TryIsExeInSettingsDict(string exeFile, out string? error)
    {
        error = null;
        var exe = (exeFile ?? string.Empty).Trim();
        if (exe.Length == 0)
        {
            error = "exeFile is required.";
            return false;
        }

        if (!TryGetExeSettingsDict(out var dict, out error) || dict is null)
        {
            return false;
        }

        foreach (var key in dict.Keys)
        {
            if (string.Equals(key?.ToString(), exe, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public static bool TryRemoveProfileId(string exeFile, string profileId, out string? error)
    {
        error = null;
        var id = (profileId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "profileId is required.";
            return false;
        }

        var exe = (exeFile ?? string.Empty).Trim();
        if (exe.Length == 0)
        {
            error = "exeFile is required.";
            return false;
        }

        if (!TryGetExeSettings(exe, out var settings, out error) || settings is null)
        {
            return true;
        }

        var list = EnsureMutableProfileList(settings);
        if (list is null)
        {
            return true;
        }

        for (var i = list.Count - 1; i >= 0; i--)
        {
            if (string.Equals(list[i]?.ToString(), id, StringComparison.OrdinalIgnoreCase))
            {
                list.RemoveAt(i);
            }
        }

        return TrySaveExeSettings(settings, out error);
    }

    public static bool TryAppendProfileId(ExeSettings settings, string profileId, out string? error)
    {
        error = null;
        var id = (profileId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "profileId is required.";
            return false;
        }

        var list = EnsureMutableProfileList(settings);
        if (list is null)
        {
            error = "ExeSettings.ProfileList is unavailable.";
            return false;
        }

        if (!ContainsProfileId(list, id))
        {
            list.Add(id);
        }

        return TrySaveExeSettings(settings, out error);
    }

    public static void TryReloadExeProfiles(string exeFile)
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return;
        }

        try
        {
            AppState.AppServer.LoadExeProfilesAndLock(exeFile, lockPanel: false, gotoFirst: true);
        }
        catch
        {
            // best-effort refresh
        }
    }

    private static bool TryGetExeSettingsDict(out IDictionary? dict, out string? error)
    {
        dict = null;
        error = null;

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        try
        {
            var dataService = AppState.DataService;
            var field = dataService.GetType()
                .GetFields(BindingFlags.Instance | BindingFlags.NonPublic)
                .FirstOrDefault(f =>
                    f.FieldType.IsGenericType
                    && f.FieldType.GetGenericArguments().Any(IsExeSettingsType));
            if (field is not null)
            {
                dict = field.GetValue(dataService) as IDictionary;
            }

            if (dict is null)
            {
                var method = GetExeSettingsDictMethod.Value;
                if (method is null)
                {
                    error = "DataService exe settings dictionary unavailable.";
                    return false;
                }

                dict = method.Invoke(dataService, null) as IDictionary;
            }

            if (dict is null)
            {
                error = "DataService exe settings dictionary unavailable.";
                return false;
            }

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

    private static IList? EnsureMutableProfileList(ExeSettings settings)
    {
        if (settings.ProfileList is null)
        {
            settings.ProfileList = new List<string>();
        }

        return settings.ProfileList as IList;
    }

    private static bool ContainsProfileId(IList list, string profileId)
    {
        for (var i = 0; i < list.Count; i++)
        {
            if (string.Equals(list[i]?.ToString(), profileId, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static MethodInfo? ResolveGetExeSettingsDictMethod()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        return AppState.DataService.GetType()
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .FirstOrDefault(m =>
                !m.IsSpecialName
                && m.GetParameters().Length == 0
                && m.ReturnType.IsGenericType
                && m.ReturnType.GetGenericArguments().Any(IsExeSettingsType));
    }

    private static bool IsExeSettingsType(Type type) =>
        string.Equals(type.Name, nameof(ExeSettings), StringComparison.Ordinal)
        && string.Equals(type.Namespace, typeof(ExeSettings).Namespace, StringComparison.Ordinal);

    private static MethodInfo? ResolveGetExeSettingsMethod()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        var dataService = AppState.DataService;
        return dataService.GetType()
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .FirstOrDefault(m =>
                !m.IsSpecialName
                && m.ReturnType == typeof(ExeSettings)
                && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(string)
                && m.GetParameters()[1].ParameterType == typeof(bool));
    }
}
