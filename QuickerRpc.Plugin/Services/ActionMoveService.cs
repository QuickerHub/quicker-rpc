using System;
using System.Linq;
using Quicker.Common;
using Quicker.Domain.Profiles;
using Quicker.Utilities;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Moves a local Quicker action between action profiles using Quicker's native button save path.
/// </summary>
public sealed class ActionMoveService
{
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
        bool allowSwap)
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

        var sourceRow = action.Row;
        var sourceCol = action.Col;
        var (destinationRow, destinationCol, positionError) = ResolveDestinationPosition(
            destinationProfile,
            targetRow,
            targetCol);
        if (positionError is not null)
        {
            return Fail(positionError, id);
        }

        if (ReferenceEquals(sourceProfile, destinationProfile)
            && sourceRow == destinationRow
            && sourceCol == destinationCol)
        {
            return new QuickerRpcMoveActionResult
            {
                Ok = true,
                Message = "动作已在目标位置。",
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
            };
        }

        var targetAction = destinationProfile.ActionItems?
            .FirstOrDefault(item => item is not null && item.Row == destinationRow && item.Col == destinationCol);
        if (targetAction is not null && !allowSwap)
        {
            return Fail("Target position already has an action. Pass --swap to exchange positions.", id);
        }

        try
        {
            sourceProfile.ActionItems?.Remove(action);
            if (targetAction is not null)
            {
                destinationProfile.ActionItems?.Remove(targetAction);
            }

            if (!_actionEditMgr.TrySetButtonAction(
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

            return new QuickerRpcMoveActionResult
            {
                Ok = true,
                Message = targetAction is null ? "动作已移动。" : "动作已交换位置。",
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
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message, id);
        }
    }

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

    private static (int Row, int Col, string? Error) ResolveDestinationPosition(
        ActionProfile profile,
        int? targetRow,
        int? targetCol)
    {
        if (targetRow.HasValue && targetCol.HasValue)
        {
            return (targetRow.Value, targetCol.Value, null);
        }

        var (row, col) = profile.FindEmptyPosition();
        if (row < 0 || col < 0)
        {
            return (-1, -1, "Target profile has no empty slot. Provide --row/--col with --swap to exchange positions.");
        }

        return (row, col, null);
    }

    private static QuickerRpcMoveActionResult Fail(string message, string? actionId) =>
        new()
        {
            Ok = false,
            Message = message,
            ActionId = string.IsNullOrWhiteSpace(actionId) ? null : actionId.Trim(),
        };
}
