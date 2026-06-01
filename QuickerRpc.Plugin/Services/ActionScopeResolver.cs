using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Common;
using Quicker.Domain.Profiles;

namespace QuickerRpc.Plugin.Services;

/// <summary>Maps qkrpc scope tokens (chrome, global, …) to Quicker action profiles.</summary>
internal static class ActionScopeResolver
{
    public static IReadOnlyList<ActionProfile> ResolveProfiles(ProfileManager manager, string? scope)
    {
        var trimmed = (scope ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return manager.GetProfiles(includeGlobal: true)
                .Where(p => p is not null)
                .ToList();
        }

        var key = trimmed.ToLowerInvariant();
        return key switch
        {
            "global" or "全局" => manager.GetGlobalProfiles(filterByMachine: true).Where(p => p is not null).ToList(),
            "common" or "通用" => manager.GetCommonProfiles().Where(p => p is not null).ToList(),
            "default" or "默认" => new[] { manager.GetDefaultProfile() }.Where(p => p is not null).ToList(),
            "taskbar" or "任务栏" => ProfilesByExeFile(manager, ActionProfile.ExeName_Taskbar),
            "desktop" or "桌面" => ProfilesByExeFile(manager, ActionProfile.ExeName_Desktop),
            "agent" or "qkrpc" => ProfilesByExeFile(manager, QkrpcVirtualActionHost.VirtualExeFile),
            _ => ResolveCustomScope(manager, trimmed),
        };
    }

    private static IReadOnlyList<ActionProfile> ResolveCustomScope(ProfileManager manager, string scope)
    {
        if (Guid.TryParse(scope, out _))
        {
            var byId = manager.GetProfileById(scope);
            return byId is null ? Array.Empty<ActionProfile>() : new[] { byId };
        }

        var byName = manager.GetProfiles(includeGlobal: true)
            .FirstOrDefault(p =>
                string.Equals(p.Name, scope, StringComparison.OrdinalIgnoreCase)
                || string.Equals(p.DisplayName, scope, StringComparison.OrdinalIgnoreCase));
        if (byName is not null)
        {
            return new[] { byName };
        }

        var exeCandidate = NormalizeExeFile(scope);
        var byExe = manager.GetValidProfilesByExe(exeCandidate, attachCommonProfiles: true)
            .Where(p => p is not null)
            .Distinct()
            .ToList();
        if (byExe.Count > 0)
        {
            return byExe;
        }

        return manager.GetProfiles(includeGlobal: true)
            .Where(p =>
                p is not null
                && (ProfileManager.IsProfileMatchExe(p, exeCandidate)
                    || p.ExeFile.IndexOf(scope, StringComparison.OrdinalIgnoreCase) >= 0
                    || (p.ExeFullpath ?? string.Empty).IndexOf(scope, StringComparison.OrdinalIgnoreCase) >= 0))
            .ToList();
    }

    private static IReadOnlyList<ActionProfile> ProfilesByExeFile(ProfileManager manager, string exeFile) =>
        manager.GetValidProfilesByExe(exeFile, attachCommonProfiles: false)
            .Where(p => p is not null)
            .ToList();

    private static string NormalizeExeFile(string scope)
    {
        var trimmed = scope.Trim();
        if (trimmed.Contains('\\') || trimmed.Contains('/'))
        {
            var fileName = trimmed.Replace('/', '\\');
            var index = fileName.LastIndexOf('\\');
            trimmed = index >= 0 ? fileName.Substring(index + 1) : fileName;
        }

        if (!trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            && !IsSpecialExeKey(trimmed))
        {
            trimmed += ".exe";
        }

        return trimmed.ToLowerInvariant();
    }

    private static bool IsSpecialExeKey(string value) =>
        string.Equals(value, ActionProfile.ExeName_Global, StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, ActionProfile.ExeName_Common, StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, ActionProfile.ExeName_Taskbar, StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, ActionProfile.ExeName_Desktop, StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, QkrpcVirtualActionHost.VirtualExeFile, StringComparison.OrdinalIgnoreCase);
}
