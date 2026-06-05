using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Entities;
using Quicker.Domain.Profiles;
using Quicker.Utilities;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Moves a local Quicker action between action profiles using Quicker's native button save path.
/// </summary>
public sealed class ActionMoveService
{
    private static readonly Regex GlobalNumberedName =
        new(@"#\s*(\d+)\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex SuffixNumberedName =
        new(@"#\s*(\d+)\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly ActionEditMgrAccessor? _actionEditMgr;
    private readonly ProfileManagerAccessor? _profileManager;

    public ActionMoveService()
    {
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
        _profileManager = ProfileManagerAccessor.TryCreate();
    }

    public QuickerRpcMoveActionResult MoveAction(
        string actionId,
        string targetProfile,
        int? targetRow,
        int? targetCol,
        bool allowSwap,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Fail("actionId is required.", actionId);
        }

        if (string.IsNullOrWhiteSpace(targetProfile))
        {
            return Fail("targetProfile is required.", id);
        }

        if (_actionEditMgr?.SetButtonAction is null)
        {
            return Fail("Not running inside Quicker (ActionEditMgr.SetButtonAction unavailable).", id);
        }

        if (_profileManager is null)
        {
            return Fail("Not running inside Quicker (ProfileManager unavailable).", id);
        }

        if ((targetRow.HasValue && !targetCol.HasValue) || (!targetRow.HasValue && targetCol.HasValue))
        {
            return Fail("Provide both targetRow and targetCol, or neither.", id);
        }

        if ((targetRow.HasValue && targetRow.Value < 0) || (targetCol.HasValue && targetCol.Value < 0))
        {
            return Fail("targetRow and targetCol must be non-negative.", id);
        }

        if (!DataServiceActionAccess.TryGetById(id, out var action, out var sourceProfile)
            || action is null
            || sourceProfile is null)
        {
            return Fail($"Action not found: {id}", id);
        }

        if (!TryResolveTargetProfile(targetProfile, out var destinationProfile, out var profileError)
            || destinationProfile is null)
        {
            return Fail(profileError ?? $"Profile not found: {targetProfile}", id);
        }

        var noEmptyResolution = NormalizeResolution(onNoEmptySlot, "ask");
        var occupiedResolution = allowSwap
            ? "swap"
            : NormalizeResolution(onOccupiedSlot, "ask");

        var sourceRow = action.Row;
        var sourceCol = action.Col;
        var createdProfile = false;
        ActionProfile? createdPage = null;

        var (destinationRow, destinationCol, positionConflict) = ResolveDestinationPosition(
            destinationProfile,
            targetRow,
            targetCol);
        if (positionConflict == PositionConflict.NoEmptySlot)
        {
            return HandleNoEmptySlot(
                id,
                action,
                sourceProfile,
                destinationProfile,
                sourceRow,
                sourceCol,
                noEmptyResolution,
                ref destinationProfile,
                ref destinationRow,
                ref destinationCol,
                ref createdProfile,
                ref createdPage);
        }

        if (positionConflict == PositionConflict.Invalid)
        {
            return Fail("Could not resolve destination position.", id);
        }

        if (ReferenceEquals(sourceProfile, destinationProfile)
            && sourceRow == destinationRow
            && sourceCol == destinationCol)
        {
            return SuccessAtDestination(
                id,
                action,
                sourceProfile,
                destinationProfile,
                sourceRow,
                sourceCol,
                destinationRow,
                destinationCol,
                createdProfile,
                createdPage,
                "动作已在目标位置。");
        }

        var targetAction = destinationProfile.ActionItems?
            .FirstOrDefault(item => item is not null && item.Row == destinationRow && item.Col == destinationCol);
        if (targetAction is not null && occupiedResolution != "swap")
        {
            return HandleOccupiedSlot(
                id,
                action,
                destinationProfile,
                destinationRow,
                destinationCol,
                targetAction,
                occupiedResolution);
        }

        return ExecuteMove(
            id,
            action,
            sourceProfile,
            destinationProfile,
            sourceRow,
            sourceCol,
            destinationRow,
            destinationCol,
            targetAction,
            createdProfile,
            createdPage);
    }

    private QuickerRpcMoveActionResult HandleNoEmptySlot(
        string id,
        ActionItem action,
        ActionProfile sourceProfile,
        ActionProfile destinationProfile,
        int sourceRow,
        int sourceCol,
        string resolution,
        ref ActionProfile? workingProfile,
        ref int destinationRow,
        ref int destinationCol,
        ref bool createdProfile,
        ref ActionProfile? createdPage)
    {
        if (resolution == "cancel")
        {
            return Fail($"已取消：目标动作页「{destinationProfile.Name}」没有空位。", id);
        }

        if (resolution == "createpageafter" || resolution == "create-page-after")
        {
            var anchorName = destinationProfile.Name;
            if (!TryCreateBlankProfileAfter(destinationProfile, out createdPage, out var createError)
                || createdPage is null)
            {
                return Fail(createError ?? "Could not create a blank action page.", id);
            }

            workingProfile = createdPage;
            createdProfile = true;
            var (row, col) = createdPage.FindEmptyPosition();
            if (row < 0 || col < 0)
            {
                return Fail("New action page has no empty slot.", id);
            }

            destinationRow = row;
            destinationCol = col;
            return ExecuteMove(
                id,
                action,
                sourceProfile,
                workingProfile,
                sourceRow,
                sourceCol,
                destinationRow,
                destinationCol,
                targetAction: null,
                createdProfile,
                createdPage,
                insertedAfterProfileName: anchorName);
        }

        return AskNoEmptySlot(id, action, destinationProfile);
    }

    private static QuickerRpcMoveActionResult AskNoEmptySlot(
        string id,
        ActionItem action,
        ActionProfile destinationProfile) =>
        new()
        {
            Ok = false,
            NeedsUserChoice = true,
            ConflictReason = "no_empty_slot",
            Message = $"目标动作页「{destinationProfile.Name}」没有空位，请选择处理方式。",
            ActionId = id,
            ActionTitle = action.Title,
            TargetProfileId = destinationProfile.Id,
            TargetProfileName = destinationProfile.Name,
            Choices = new List<QuickerRpcMoveActionChoice>
            {
                new()
                {
                    Id = "createPageAfter",
                    Label = "在当前页后新建空白页并移动",
                    Description = "在目标动作页后插入一页空白动作页，并将动作移到新页第一个空位。",
                },
                new()
                {
                    Id = "cancel",
                    Label = "取消本次移动",
                    Description = "不移动动作，保持原位置。",
                },
            },
        };

    private static QuickerRpcMoveActionResult HandleOccupiedSlot(
        string id,
        ActionItem action,
        ActionProfile destinationProfile,
        int destinationRow,
        int destinationCol,
        ActionItem targetAction,
        string resolution)
    {
        if (resolution == "cancel")
        {
            return Fail(
                $"已取消：目标格 ({destinationRow},{destinationCol}) 已被「{targetAction.Title}」占用。",
                id);
        }

        return new QuickerRpcMoveActionResult
        {
            Ok = false,
            NeedsUserChoice = true,
            ConflictReason = "occupied_slot",
            Message =
                $"目标格 ({destinationRow},{destinationCol}) 已被「{targetAction.Title}」占用，请选择处理方式。",
            ActionId = id,
            ActionTitle = action.Title,
            TargetProfileId = destinationProfile.Id,
            TargetProfileName = destinationProfile.Name,
            TargetRow = destinationRow,
            TargetCol = destinationCol,
            OccupiedActionId = targetAction.Id,
            OccupiedActionTitle = targetAction.Title,
            Choices = new List<QuickerRpcMoveActionChoice>
            {
                new()
                {
                    Id = "swap",
                    Label = "与目标格动作交换位置",
                    Description = $"将两个动作互换格子（占用格动作：{targetAction.Title}）。",
                },
                new()
                {
                    Id = "cancel",
                    Label = "取消本次移动",
                    Description = "不移动动作，保持原位置。",
                },
            },
        };
    }

    private QuickerRpcMoveActionResult ExecuteMove(
        string id,
        ActionItem action,
        ActionProfile sourceProfile,
        ActionProfile destinationProfile,
        int sourceRow,
        int sourceCol,
        int destinationRow,
        int destinationCol,
        ActionItem? targetAction,
        bool createdProfile,
        ActionProfile? createdPage,
        string? insertedAfterProfileName = null)
    {
        try
        {
            sourceProfile.ActionItems?.Remove(action);
            if (targetAction is not null)
            {
                destinationProfile.ActionItems?.Remove(targetAction);
            }

            if (!_actionEditMgr!.TrySetButtonAction(
                    sourceProfile,
                    sourceRow,
                    sourceCol,
                    targetAction!,
                    skipSave: ReferenceEquals(sourceProfile, destinationProfile),
                    out var sourceSaveError))
            {
                return Fail(sourceSaveError ?? "Could not save source profile.", id);
            }

            if (!_actionEditMgr.TrySetButtonAction(
                    destinationProfile,
                    destinationRow,
                    destinationCol,
                    action,
                    skipSave: false,
                    out var targetSaveError))
            {
                return Fail(targetSaveError ?? "Could not save target profile.", id);
            }

            var message = targetAction is null ? "动作已移动。" : "动作已交换位置。";
            if (createdProfile && createdPage is not null)
            {
                var anchorName = insertedAfterProfileName ?? destinationProfile.Name;
                message = $"已在「{anchorName}」后新建空白页并移动动作。";
            }

            return new QuickerRpcMoveActionResult
            {
                Ok = true,
                Message = message,
                ActionId = id,
                ActionTitle = action.Title,
                SourceProfileId = sourceProfile.Id,
                SourceProfileName = sourceProfile.Name,
                SourceRow = sourceRow,
                SourceCol = sourceCol,
                TargetProfileId = destinationProfile.Id,
                TargetProfileName = destinationProfile.Name,
                TargetRow = destinationRow,
                TargetCol = destinationCol,
                SwappedActionId = targetAction?.Id,
                SwappedActionTitle = targetAction?.Title,
                CreatedProfile = createdProfile,
                CreatedProfileId = createdPage?.Id,
                CreatedProfileName = createdPage?.Name,
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message, id);
        }
    }

    private static QuickerRpcMoveActionResult SuccessAtDestination(
        string id,
        ActionItem action,
        ActionProfile sourceProfile,
        ActionProfile destinationProfile,
        int sourceRow,
        int sourceCol,
        int destinationRow,
        int destinationCol,
        bool createdProfile,
        ActionProfile? createdPage,
        string message) =>
        new()
        {
            Ok = true,
            Message = message,
            ActionId = id,
            ActionTitle = action.Title,
            SourceProfileId = sourceProfile.Id,
            SourceProfileName = sourceProfile.Name,
            SourceRow = sourceRow,
            SourceCol = sourceCol,
            TargetProfileId = destinationProfile.Id,
            TargetProfileName = destinationProfile.Name,
            TargetRow = destinationRow,
            TargetCol = destinationCol,
            CreatedProfile = createdProfile,
            CreatedProfileId = createdPage?.Id,
            CreatedProfileName = createdPage?.Name,
        };

    private bool TryResolveTargetProfile(string profileValue, out ActionProfile? profile, out string? error)
    {
        profile = null;
        error = null;

        var trimmed = profileValue.Trim();
        var manager = _profileManager!.Instance;
        var matches = ActionScopeResolver.ResolveProfiles(manager, trimmed)
            .Where(p => p is not null)
            .Distinct()
            .ToList();
        if (matches.Count == 1)
        {
            profile = matches[0];
            return true;
        }

        if (matches.Count > 1)
        {
            error = $"Profile selector matched {matches.Count} profiles; use a profile id or exact profile name.";
            return false;
        }

        error = $"Profile not found: {trimmed}";
        return false;
    }

    private enum PositionConflict
    {
        None,
        NoEmptySlot,
        Invalid,
    }

    private static (int Row, int Col, PositionConflict Conflict) ResolveDestinationPosition(
        ActionProfile profile,
        int? targetRow,
        int? targetCol)
    {
        if (targetRow.HasValue && targetCol.HasValue)
        {
            return (targetRow.Value, targetCol.Value, PositionConflict.None);
        }

        var (row, col) = profile.FindEmptyPosition();
        if (row < 0 || col < 0)
        {
            return (-1, -1, PositionConflict.NoEmptySlot);
        }

        return (row, col, PositionConflict.None);
    }

    private bool TryCreateBlankProfileAfter(
        ActionProfile anchor,
        out ActionProfile? created,
        out string? error)
    {
        created = null;
        error = null;

        try
        {
            var manager = _profileManager!.Instance;
            var exeFile = anchor.ExeFile ?? ActionProfile.ExeName_Global;
            var siblings = ListProfilesForExe(manager, exeFile);
            var insertAt = anchor.ListOrder + 1;

            foreach (var profile in siblings
                         .Where(p => p.ListOrder >= insertAt)
                         .OrderByDescending(p => p.ListOrder))
            {
                profile.ListOrder++;
                manager.SaveProfile(profile);
            }

            var profileName = NextProfileNameAfter(anchor, siblings, exeFile);
            var dto = new CreateProfileDto
            {
                ExeFile = exeFile,
                ProfileName = profileName,
                ListOrder = insertAt,
            };

            created = AppState.AppServer.AddProfile(dto);
            if (anchor.IsVirtual)
            {
                created.IsVirtual = true;
            }

            manager.SaveProfile(created);
            siblings.Add(created);

            if (string.Equals(exeFile, ActionProfile.ExeName_Global, StringComparison.OrdinalIgnoreCase)
                && !GlobalExeSettingsAccessor.TryInsertProfilesAfter(
                    anchor.Id ?? string.Empty,
                    new List<string> { created.Id ?? string.Empty },
                    out error))
            {
                created = null;
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static IList<ActionProfile> ListProfilesForExe(ProfileManager manager, string exeFile)
    {
        if (string.Equals(exeFile, ActionProfile.ExeName_Global, StringComparison.OrdinalIgnoreCase))
        {
            return manager.GetGlobalProfiles(filterByMachine: true)
                .Where(p => p is not null)
                .Cast<ActionProfile>()
                .ToList();
        }

        var fromExe = TryGetProfilesByExe(manager, exeFile);
        if (fromExe is not null)
        {
            return fromExe
                .Where(p => p is not null)
                .Cast<ActionProfile>()
                .ToList();
        }

        return manager.GetProfiles(includeGlobal: false)
            .Where(p => p is not null
                && string.Equals(p!.ExeFile, exeFile, StringComparison.OrdinalIgnoreCase))
            .Cast<ActionProfile>()
            .ToList();
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

    private static string NextProfileNameAfter(
        ActionProfile anchor,
        IEnumerable<ActionProfile> siblings,
        string exeFile)
    {
        if (string.Equals(exeFile, ActionProfile.ExeName_Global, StringComparison.OrdinalIgnoreCase))
        {
            return $"全局 #{NextGlobalNumber(siblings)}";
        }

        var anchorName = (anchor.Name ?? "动作页").Trim();
        var baseName = SuffixNumberedName.IsMatch(anchorName)
            ? SuffixNumberedName.Replace(anchorName, string.Empty).TrimEnd()
            : anchorName;
        if (baseName.Length == 0)
        {
            baseName = "动作页";
        }

        var max = 1;
        foreach (var profile in siblings)
        {
            var name = profile.Name ?? string.Empty;
            if (!name.StartsWith(baseName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var match = SuffixNumberedName.Match(name);
            if (match.Success
                && int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            {
                max = Math.Max(max, n);
                continue;
            }

            if (string.Equals(name, baseName, StringComparison.OrdinalIgnoreCase))
            {
                max = Math.Max(max, 1);
            }
        }

        return $"{baseName} #{max + 1}";
    }

    private static int NextGlobalNumber(IEnumerable<ActionProfile> profiles)
    {
        var max = 0;
        foreach (var profile in profiles)
        {
            var name = profile.Name ?? string.Empty;
            var match = GlobalNumberedName.Match(name);
            if (match.Success
                && int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            {
                max = Math.Max(max, n);
            }
        }

        return max + 1;
    }

    private static string NormalizeResolution(string? value, string defaultValue)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return defaultValue;
        }

        return trimmed.Replace("-", string.Empty).ToLowerInvariant();
    }

    private static QuickerRpcMoveActionResult Fail(string message, string? actionId) =>
        new()
        {
            Ok = false,
            Message = message,
            ActionId = string.IsNullOrWhiteSpace(actionId) ? null : actionId.Trim(),
        };
}
