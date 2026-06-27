using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Common;
using Quicker.Domain.Profiles;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Deletes empty Quicker action profile pages via ProfileManager.CanDeleteProfile / RemoveProfile.
/// </summary>
public sealed class ProfileDeleteService
{
    private readonly ProfileManagerAccessor? _profileManager;

    public ProfileDeleteService()
    {
        _profileManager = ProfileManagerAccessor.TryCreate();
    }

    public QuickerRpcDeleteProfileResult DeleteEmptyProfiles(IReadOnlyList<string> profileIdsOrNames)
    {
        if (profileIdsOrNames.Count == 0)
        {
            return Fail("Provide at least one profile id or exact profile name.");
        }

        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).");
        }

        var deleted = new List<QuickerRpcDeletedProfileItem>();
        var failures = new List<QuickerRpcDeleteProfileFailure>();
        foreach (var raw in profileIdsOrNames)
        {
            var token = (raw ?? string.Empty).Trim();
            if (token.Length == 0)
            {
                continue;
            }

            if (!TryResolveProfile(token, out var profile, out var resolveError) || profile is null)
            {
                failures.Add(new QuickerRpcDeleteProfileFailure
                {
                    ProfileRef = token,
                    Message = resolveError ?? $"Profile not found: {token}",
                });
                continue;
            }

            var actionCount = CountActions(profile);
            if (actionCount > 0)
            {
                failures.Add(new QuickerRpcDeleteProfileFailure
                {
                    ProfileRef = token,
                    ProfileId = profile.Id,
                    ProfileName = profile.Name,
                    ActionCount = actionCount,
                    Message = $"动作页「{profile.Name}」仍有 {actionCount} 个动作，无法删除。",
                });
                continue;
            }

            var manager = _profileManager.Instance;
            if (!manager.CanDeleteProfile(profile))
            {
                failures.Add(new QuickerRpcDeleteProfileFailure
                {
                    ProfileRef = token,
                    ProfileId = profile.Id,
                    ProfileName = profile.Name,
                    Message = $"动作页「{profile.Name}」不可删除（可能为受保护页或仍含内容）。",
                });
                continue;
            }

            try
            {
                var exeFile = profile.ExeFile ?? ActionProfile.ExeName_Global;
                if (!ExeSettingsAccessor.TryRemoveProfileId(exeFile, profile.Id ?? string.Empty, out var listError))
                {
                    failures.Add(new QuickerRpcDeleteProfileFailure
                    {
                        ProfileRef = token,
                        ProfileId = profile.Id,
                        ProfileName = profile.Name,
                        Message = listError ?? "Could not update exe profile tab list.",
                    });
                    continue;
                }

                if (!manager.RemoveProfile(profile))
                {
                    failures.Add(new QuickerRpcDeleteProfileFailure
                    {
                        ProfileRef = token,
                        ProfileId = profile.Id,
                        ProfileName = profile.Name,
                        Message = $"删除动作页「{profile.Name}」失败。",
                    });
                    continue;
                }

                if (string.Equals(exeFile, ActionProfile.ExeName_Global, StringComparison.OrdinalIgnoreCase))
                {
                    GlobalExeSettingsAccessor.TryReloadGlobalProfiles();
                }
                else
                {
                    ExeSettingsAccessor.TryReloadExeProfiles(exeFile);
                }

                deleted.Add(new QuickerRpcDeletedProfileItem
                {
                    ProfileId = profile.Id ?? string.Empty,
                    ProfileName = profile.Name ?? string.Empty,
                    ExeFile = exeFile,
                });
            }
            catch (Exception ex)
            {
                failures.Add(new QuickerRpcDeleteProfileFailure
                {
                    ProfileRef = token,
                    ProfileId = profile.Id,
                    ProfileName = profile.Name,
                    Message = ex.Message,
                });
            }
        }

        if (deleted.Count == 0)
        {
            return new QuickerRpcDeleteProfileResult
            {
                Ok = false,
                Message = failures.Count == 1
                    ? failures[0].Message
                    : $"未能删除 {failures.Count} 个动作页。",
                Deleted = deleted,
                Failures = failures,
            };
        }

        var message = deleted.Count == 1
            ? $"已删除空白动作页「{deleted[0].ProfileName}」。"
            : $"已删除 {deleted.Count} 个空白动作页。";
        if (failures.Count > 0)
        {
            message += $" {failures.Count} 个失败。";
        }

        return new QuickerRpcDeleteProfileResult
        {
            Ok = failures.Count == 0,
            Message = message,
            Deleted = deleted,
            Failures = failures,
        };
    }

    public QuickerRpcDeleteProfileResult PruneEmptyProfiles(string scope)
    {
        var trimmed = (scope ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return Fail("Provide --scope (e.g. chrome.exe, global).");
        }

        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).");
        }

        var manager = _profileManager.Instance;
        var profiles = ListProfilesForPruneScope(manager, trimmed);
        if (profiles.Count == 0)
        {
            return Fail($"No action pages found for scope: {trimmed}");
        }

        var emptyIds = profiles
            .Where(profile => CountActions(profile) == 0 && manager.CanDeleteProfile(profile))
            .Select(profile => profile.Id ?? string.Empty)
            .Where(id => id.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (emptyIds.Count == 0)
        {
            return new QuickerRpcDeleteProfileResult
            {
                Ok = true,
                Message = $"scope={trimmed}: 没有可删除的空白动作页。",
            };
        }

        return DeleteEmptyProfiles(emptyIds);
    }

    private static IReadOnlyList<ActionProfile> ListProfilesForPruneScope(ProfileManager manager, string scope)
    {
        var key = scope.Trim().ToLowerInvariant();
        if (key is "global" or "全局")
        {
            return manager.GetGlobalProfiles(filterByMachine: true)
                .Where(p => p is not null)
                .Cast<ActionProfile>()
                .ToList();
        }

        var exeFile = NormalizeExeFile(scope);
        return manager.GetValidProfilesByExe(exeFile, attachCommonProfiles: false)
            .Where(p => p is not null
                && string.Equals(p!.ExeFile, exeFile, StringComparison.OrdinalIgnoreCase))
            .Cast<ActionProfile>()
            .Distinct()
            .ToList();
    }

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
            && !string.Equals(trimmed, ActionProfile.ExeName_Global, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(trimmed, ActionProfile.ExeName_Common, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(trimmed, ActionProfile.ExeName_Taskbar, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(trimmed, ActionProfile.ExeName_Desktop, StringComparison.OrdinalIgnoreCase)
            && !(trimmed.StartsWith("_", StringComparison.Ordinal) && trimmed.IndexOf('\\') < 0 && trimmed.IndexOf('/') < 0))
        {
            trimmed += ".exe";
        }

        return trimmed.ToLowerInvariant();
    }

    private bool TryResolveProfile(string profileRef, out ActionProfile? profile, out string? error)
    {
        profile = null;
        error = null;
        var manager = _profileManager!.Instance;

        if (Guid.TryParse(profileRef, out _))
        {
            profile = manager.GetProfileById(profileRef);
            if (profile is null)
            {
                error = $"Profile not found: {profileRef}";
                return false;
            }

            return true;
        }

        var matches = manager.GetProfiles(includeGlobal: true)
            .Where(p => p is not null
                && (string.Equals(p!.Name, profileRef, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.DisplayName, profileRef, StringComparison.OrdinalIgnoreCase)))
            .Distinct()
            .ToList();
        if (matches.Count == 1)
        {
            profile = matches[0];
            return true;
        }

        if (matches.Count > 1)
        {
            error = $"Profile name matched {matches.Count} pages; use profile id.";
            return false;
        }

        error = $"Profile not found: {profileRef}";
        return false;
    }

    private static int CountActions(ActionProfile profile) =>
        profile.ActionItems?.Count(item => item is not null) ?? 0;

    private static QuickerRpcDeleteProfileResult Fail(string message) =>
        new() { Ok = false, Message = message };
}
