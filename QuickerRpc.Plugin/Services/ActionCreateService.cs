using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Entities;
using Quicker.Domain.Profiles;
using Quicker.Utilities;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless XAction creation: ensures a virtual process/page slot, then saves via ActionEditMgr.SetButtonAction.
/// </summary>
public sealed class ActionCreateService
{
    private readonly ActionEditMgrAccessor? _actionEditMgr;
    private readonly ProfileManagerAccessor? _profileManager;

    public ActionCreateService()
    {
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
        _profileManager = ProfileManagerAccessor.TryCreate();
    }

    public QuickerRpcCreateActionResult CreateAction(
        string? title,
        string? description,
        string? icon,
        string? profileId)
    {
        if (_actionEditMgr?.SetButtonAction is null)
        {
            return Fail("Not running inside Quicker (ActionEditMgr.SetButtonAction unavailable).");
        }

        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).");
        }

        try
        {
            var (profile, createdProfile, row, col, error) = ResolvePlacement(profileId);
            if (profile is null)
            {
                return Fail(error ?? "Could not resolve an action page slot.");
            }

            var actionItem = ActionTypeManager.CreateActionItem(ActionType.XAction);
            if (actionItem is null)
            {
                return Fail("ActionTypeManager could not create an XAction item.");
            }

            actionItem.Row = row;
            actionItem.Col = col;
            actionItem.CreateTimeUtc = AppHelper.GetUtcNowForDb();
            actionItem.LastEditTimeUtc = actionItem.CreateTimeUtc;
            actionItem.Title = string.IsNullOrWhiteSpace(title) ? "新动作" : title.Trim();
            if (description is not null)
            {
                actionItem.Description = description;
            }

            ApplyIcon(actionItem, icon);
            TryApplyTemplate(actionItem);
            EnsureXActionPayload(actionItem);

            if (!_actionEditMgr.TrySetButtonAction(profile, row, col, actionItem, skipSave: false, out var saveError))
            {
                return Fail(saveError ?? "SetButtonAction failed.");
            }

            var actionId = (actionItem.Id ?? string.Empty).Trim();
            if (actionId.Length == 0)
            {
                return Fail("Action was saved but has no id.");
            }

            return new QuickerRpcCreateActionResult
            {
                Ok = true,
                Message = createdProfile ? "已在新的虚拟动作页创建动作。" : "已在虚拟动作页创建动作。",
                ActionId = actionId,
                ProfileId = profile.Id,
                ProfileName = profile.Name,
                ExeFile = profile.ExeFile,
                Row = row,
                Col = col,
                EditVersion = ToUnixMilliseconds(actionItem.LastEditTimeUtc),
                CreatedProfile = createdProfile,
                IsVirtual = profile.IsVirtual,
            };
        }
        catch (TargetInvocationException ex)
        {
            return Fail(ex.InnerException?.Message ?? ex.Message);
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    private (ActionProfile? Profile, bool CreatedProfile, int Row, int Col, string? Error) ResolvePlacement(string? profileId)
    {
        var manager = _profileManager!.Instance;
        var pages = ListManagedVirtualPages(manager, profileId);
        foreach (var page in pages)
        {
            var (row, col) = page.FindEmptyPosition();
            if (row >= 0 && col >= 0)
            {
                return (page, false, row, col, null);
            }
        }

        var created = CreateVirtualPage(manager, pages.Count);
        var (createdRow, createdCol) = created.FindEmptyPosition();
        if (createdRow < 0 || createdCol < 0)
        {
            return (null, true, -1, -1, "New virtual action page has no empty slot.");
        }

        return (created, true, createdRow, createdCol, null);
    }

    private static IList<ActionProfile> ListManagedVirtualPages(ProfileManager manager, string? profileId)
    {
        var pages = new List<ActionProfile>();
        foreach (var profile in EnumerateProfilesForVirtualExe(manager))
        {
            if (profile is null)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(profileId)
                && !string.Equals(profile.Id, profileId.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (IsManagedVirtualPage(profile))
            {
                pages.Add(profile);
            }
        }

        return pages
            .OrderBy(p => p.ListOrder)
            .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IEnumerable<ActionProfile> EnumerateProfilesForVirtualExe(ProfileManager manager)
    {
        IList<ActionProfile>? fromExe = TryGetProfilesByExe(manager, QkrpcVirtualActionHost.VirtualExeFile);
        if (fromExe is not null)
        {
            return fromExe.Where(p => p is not null)!;
        }

        return manager.GetProfiles(includeGlobal: false)
            .Where(profile => profile is not null
                && string.Equals(profile.ExeFile, QkrpcVirtualActionHost.VirtualExeFile, StringComparison.OrdinalIgnoreCase));
    }

    private static IList<ActionProfile>? TryGetProfilesByExe(ProfileManager manager, string exeFile)
    {
        try
        {
            var byExe = manager.GetType().GetMethod(
                "GetAllProfilesByExe",
                BindingFlags.Public | BindingFlags.Instance,
                binder: null,
                types: new[] { typeof(string), typeof(bool) },
                modifiers: null);
            if (byExe?.Invoke(manager, new object[] { exeFile, true }) is not IEnumerable raw)
            {
                return null;
            }

            var list = new List<ActionProfile>();
            foreach (var item in raw)
            {
                if (item is ActionProfile profile)
                {
                    list.Add(profile);
                }
            }

            return list;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsManagedVirtualPage(ActionProfile profile) =>
        profile.IsVirtual
        || (profile.Name?.StartsWith(QkrpcVirtualActionHost.ProfileNamePrefix, StringComparison.OrdinalIgnoreCase) ?? false);

    private static ActionProfile CreateVirtualPage(ProfileManager manager, int existingPageCount)
    {
        var nextIndex = existingPageCount + 1;
        var dto = new CreateProfileDto
        {
            ExeFile = QkrpcVirtualActionHost.VirtualExeFile,
            ProfileName = QkrpcVirtualActionHost.ProfileNamePrefix + nextIndex.ToString("000", System.Globalization.CultureInfo.InvariantCulture),
            ListOrder = nextIndex,
        };

        var profile = AppState.AppServer.AddProfile(dto);
        profile.IsVirtual = true;
        manager.SaveProfile(profile);
        return profile;
    }

    private static void ApplyIcon(ActionItem actionItem, string? icon)
    {
        if (!string.IsNullOrWhiteSpace(icon))
        {
            actionItem.Icon = icon.Trim();
            return;
        }

        var defaultIcon = TryGetNewActionDefaultIcon();
        if (string.Equals(defaultIcon, "auto", StringComparison.OrdinalIgnoreCase))
        {
            actionItem.Icon = $"fa:{AppHelper.RandomEnumValue<FontAwesome5.EFontAwesomeIcon>()}";
        }
        else
        {
            actionItem.Icon = defaultIcon ?? string.Empty;
        }
    }

    private static string? TryGetNewActionDefaultIcon()
    {
        try
        {
            var settings = typeof(AppState).GetProperty(
                "Settings",
                BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
            return settings?.GetType().GetProperty("NewActionDefaultIcon")?.GetValue(settings) as string;
        }
        catch
        {
            return null;
        }
    }

    private static void EnsureXActionPayload(ActionItem actionItem)
    {
        if (!string.IsNullOrWhiteSpace(actionItem.Data))
        {
            return;
        }

        actionItem.Data = JsonConvert.SerializeObject(new XAction
        {
            Steps = new List<global::Quicker.Domain.Actions.X.Storage.ActionStep>(),
            Variables = new List<global::Quicker.Domain.Actions.X.Storage.ActionVariable>(),
            SubPrograms = new List<SubProgram>(),
        });
    }

    private static void TryApplyTemplate(ActionItem actionItem)
    {
        try
        {
            var dataService = AppState.DataService;
            var getByName = dataService.GetType().GetMethod(
                "GetActionsByName",
                BindingFlags.Public | BindingFlags.Instance,
                binder: null,
                types: new[] { typeof(string) },
                modifiers: null);
            if (getByName?.Invoke(dataService, new object[] { "_template_" }) is not IList templates
                || templates.Count == 0
                || templates[0] is not ActionItem template)
            {
                return;
            }

            actionItem.Data = template.Data;
            actionItem.Association = AppHelper.Clone(template.Association);
            actionItem.ContextMenuData = template.ContextMenuData;
            actionItem.EnableEvaluateVariable = template.EnableEvaluateVariable;
        }
        catch
        {
            // optional template
        }
    }

    private static long ToUnixMilliseconds(DateTime? dt)
    {
        if (!dt.HasValue)
        {
            return 0;
        }

        var v = dt.Value;
        var utc = v.Kind switch
        {
            DateTimeKind.Utc => v,
            DateTimeKind.Local => v.ToUniversalTime(),
            _ => DateTime.SpecifyKind(v, DateTimeKind.Utc),
        };

        return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds();
    }

    private static QuickerRpcCreateActionResult Fail(string message) =>
        new() { Ok = false, Message = message };
}
