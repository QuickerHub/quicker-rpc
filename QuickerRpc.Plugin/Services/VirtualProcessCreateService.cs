using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Entities;
using Quicker.Domain.Profiles;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>Creates Quicker virtual processes (custom ExeFile tabs) with an initial action page.</summary>
public sealed class VirtualProcessCreateService
{
    private readonly ProfileManagerAccessor? _profileManager;
    private readonly ActionMoveService _actionMoveService;

    public VirtualProcessCreateService(ActionMoveService actionMoveService)
    {
        _profileManager = ProfileManagerAccessor.TryCreate();
        _actionMoveService = actionMoveService;
    }

    public QuickerRpcCreateVirtualProcessResult EnsureCeaCoreRunVirtualProcess(bool moveMatchingActions)
    {
        return EnsureVirtualProcess(
            CeaCoreRunVirtualActionHost.VirtualExeFile,
            CeaCoreRunVirtualActionHost.DisplayName,
            CeaCoreRunVirtualActionHost.ProfileNamePrefix,
            moveMatchingActions ? CeaCoreRunVirtualActionHost.SubProgramName : null,
            dedicatedSubProgramOnly: true);
    }

    public QuickerRpcCreateVirtualProcessResult EnsureVirtualProcess(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName,
        bool dedicatedSubProgramOnly = false)
    {
        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).");
        }

        var exe = (exeFile ?? string.Empty).Trim();
        if (exe.Length == 0)
        {
            return Fail("exeFile is required.");
        }

        try
        {
            var hadPersistedProcess = ExeSettingsAccessor.TryIsExeInSettingsDict(exe, out _);
            if (!ExeSettingsAccessor.TryEnsureVirtualExe(exe, displayName, out var settings, out var settingsError))
            {
                return Fail(settingsError ?? "Failed to register virtual process.");
            }

            var createdProcess = !hadPersistedProcess;

            var manager = _profileManager.Instance;
            var pages = ListVirtualPages(manager, exe);
            var createdProfile = false;
            ActionProfile profile;
            if (pages.Count == 0)
            {
                profile = CreateVirtualPage(manager, exe, profileNamePrefix, pageIndex: 1);
                createdProfile = true;
                if (!ExeSettingsAccessor.TryAppendProfileId(settings, profile.Id ?? string.Empty, out var orderError))
                {
                    return Fail(orderError ?? "Failed to update ExeSettings profile order.");
                }
            }
            else
            {
                profile = pages[0];
            }

            ExeSettingsAccessor.TryReloadExeProfiles(exe);

            var inExeSettingsDict = ExeSettingsAccessor.TryIsExeInSettingsDict(exe, out _);

            var moved = new List<QuickerRpcMovedActionItem>();
            if (!string.IsNullOrWhiteSpace(collectSubProgramName))
            {
                var matches = dedicatedSubProgramOnly
                    ? ActionSubProgramCallScanner.FindActionsDedicatedToSubProgram(collectSubProgramName)
                    : ActionSubProgramCallScanner.FindActionsCallingSubProgram(collectSubProgramName);
                foreach (var entry in matches)
                {
                    var actionId = (entry.Action.Id ?? string.Empty).Trim();
                    if (actionId.Length == 0)
                    {
                        continue;
                    }

                    if (entry.Profile is not null
                        && string.Equals(entry.Profile.ExeFile, exe, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var moveResult = _actionMoveService.MoveAction(
                        actionId,
                        profile.Id ?? string.Empty,
                        targetRow: null,
                        targetCol: null,
                        allowSwap: false);
                    if (!moveResult.Ok)
                    {
                        continue;
                    }

                    moved.Add(new QuickerRpcMovedActionItem
                    {
                        ActionId = moveResult.ActionId ?? actionId,
                        ActionTitle = moveResult.ActionTitle ?? entry.Action.Title ?? string.Empty,
                        SourceProfileName = moveResult.SourceProfileName ?? entry.Profile?.Name ?? string.Empty,
                        TargetRow = moveResult.TargetRow,
                        TargetCol = moveResult.TargetCol,
                    });
                }
            }

            var movedMessage = moved.Count > 0
                ? $" 已移动 {moved.Count} 个调用 {collectSubProgramName} 的动作。"
                : string.Empty;

            return new QuickerRpcCreateVirtualProcessResult
            {
                Ok = true,
                Message = createdProcess || createdProfile
                    ? $"已创建虚拟进程「{displayName}」({exe})。{movedMessage}".Trim()
                    : $"虚拟进程「{displayName}」({exe}) 已存在。{movedMessage}".Trim(),
                ExeFile = exe,
                DisplayName = displayName,
                Scope = ScopeTokenForExe(exe),
                ProfileId = profile.Id,
                ProfileName = profile.Name,
                CreatedProcess = createdProcess,
                CreatedProfile = createdProfile,
                InExeSettingsDict = inExeSettingsDict,
                MovedActions = moved,
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

    private static string ScopeTokenForExe(string exeFile) =>
        string.Equals(exeFile, CeaCoreRunVirtualActionHost.VirtualExeFile, StringComparison.OrdinalIgnoreCase)
            ? CeaCoreRunVirtualActionHost.Scope
            : exeFile;

    private static IList<ActionProfile> ListVirtualPages(ProfileManager manager, string exeFile)
    {
        var fromExe = TryGetProfilesByExe(manager, exeFile);
        if (fromExe is not null)
        {
            return fromExe
                .Where(p => p is not null)
                .OrderBy(p => p!.ListOrder)
                .ThenBy(p => p!.Name, StringComparer.OrdinalIgnoreCase)
                .ToList()!;
        }

        return manager.GetProfiles(includeGlobal: false)
            .Where(p => p is not null
                && string.Equals(p.ExeFile, exeFile, StringComparison.OrdinalIgnoreCase))
            .OrderBy(p => p!.ListOrder)
            .ThenBy(p => p!.Name, StringComparer.OrdinalIgnoreCase)
            .ToList()!;
    }

    private static ActionProfile CreateVirtualPage(
        ProfileManager manager,
        string exeFile,
        string profileNamePrefix,
        int pageIndex)
    {
        var pageName = profileNamePrefix.TrimEnd() + " "
            + pageIndex.ToString("000", CultureInfo.InvariantCulture);
        var dto = new CreateProfileDto
        {
            ExeFile = exeFile,
            ProfileName = pageName.Trim(),
            ListOrder = pageIndex,
        };

        var profile = AppState.AppServer.AddProfile(dto);
        profile.IsVirtual = true;
        manager.SaveProfile(profile);
        return profile;
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

    private static QuickerRpcCreateVirtualProcessResult Fail(string message) =>
        new() { Ok = false, Message = message };
}
