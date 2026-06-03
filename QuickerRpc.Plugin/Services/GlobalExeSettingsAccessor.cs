using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Entities;
using Quicker.Domain.Profiles;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads/writes global exe tab order via <see cref="ExeSettings.ProfileList"/> (profile id list).
/// </summary>
internal static class GlobalExeSettingsAccessor
{
    private static readonly Lazy<MethodInfo?> GetExeSettingsMethod = new(ResolveGetExeSettingsMethod);
    private static readonly Lazy<MethodInfo?> LoadGlobalProfilesMethod = new(ResolveLoadGlobalProfilesMethod);
    private static readonly Lazy<object?> ProfileSwitcherInstance = new(ResolveProfileSwitcherInstance);

    public static bool TryGetGlobalExeSettings(out ExeSettings? settings, out string? error)
    {
        settings = null;
        error = null;

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
            settings = method.Invoke(AppState.DataService, new object[] { ActionProfile.ExeName_Global, true }) as ExeSettings;
            if (settings is null)
            {
                error = $"ExeSettings not found for {ActionProfile.ExeName_Global}.";
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

    public static bool TryInsertProfilesAfter(
        string anchorProfileId,
        IReadOnlyList<string> profileIds,
        out string? error)
    {
        error = null;
        if (profileIds.Count == 0)
        {
            return true;
        }

        if (!TryGetGlobalExeSettings(out var settings, out error) || settings is null)
        {
            return false;
        }

        var list = EnsureMutableProfileList(settings);
        if (list is null)
        {
            error = "ExeSettings.ProfileList is unavailable.";
            return false;
        }

        var anchorIndex = FindAnchorIndex(list, anchorProfileId);
        if (anchorIndex < 0)
        {
            error = $"Anchor profile not found in global ProfileList: {anchorProfileId}";
            return false;
        }

        var ids = profileIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        foreach (var id in ids)
        {
            var existing = IndexOfProfileId(list, id);
            if (existing >= 0)
            {
                list.RemoveAt(existing);
                if (existing <= anchorIndex)
                {
                    anchorIndex--;
                }
            }
        }

        var insertAt = anchorIndex + 1;
        for (var i = 0; i < ids.Count; i++)
        {
            list.Insert(insertAt + i, ids[i]);
        }

        if (!TrySaveGlobalExeSettings(settings, out error))
        {
            return false;
        }

        TryReloadGlobalProfiles();
        return true;
    }

    public static bool TrySaveGlobalExeSettings(ExeSettings settings, out string? error)
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

    public static void TryReloadGlobalProfiles()
    {
        var switcher = ProfileSwitcherInstance.Value;
        var method = LoadGlobalProfilesMethod.Value;
        if (switcher is null || method is null)
        {
            return;
        }

        try
        {
            method.Invoke(switcher, null);
        }
        catch
        {
            // best-effort refresh
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

    private static int FindAnchorIndex(IList list, string anchorProfileId)
    {
        var direct = IndexOfProfileId(list, anchorProfileId);
        if (direct >= 0)
        {
            return direct;
        }

        return list.Count > 0 ? 0 : -1;
    }

    private static int IndexOfProfileId(IList list, string profileId)
    {
        for (var i = 0; i < list.Count; i++)
        {
            if (string.Equals(list[i]?.ToString(), profileId, StringComparison.OrdinalIgnoreCase))
            {
                return i;
            }
        }

        return -1;
    }

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

    private static object? ResolveProfileSwitcherInstance()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        var appServer = AppState.AppServer;
        return appServer.GetType()
            .GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)
            .Select(f => f.GetValue(appServer))
            .FirstOrDefault(v => v is ProfileSwitcher);
    }

    private static MethodInfo? ResolveLoadGlobalProfilesMethod() =>
        typeof(ProfileSwitcher).GetMethod(
            "LoadGlobalProfiles",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
}
