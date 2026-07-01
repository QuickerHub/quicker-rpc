using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Persist global subprogram steps/variables like <see cref="ActionDesignerProgramAccess"/> /
/// <c>ActionDesignerWindow.DoSaveWithoutClose</c>: designer Save click, DesignerHostUiSave, then
/// <see cref="TriggerCommandSubProgramAccessor"/> (multi-account sync).
/// </summary>
internal static class SubProgramDesignerProgramAccess
{
    public static bool TrySave(
        string subProgramIdOrName,
        JArray steps,
        JArray variables,
        out string? error) =>
        TrySave(subProgramIdOrName, steps, variables, name: null, description: null, icon: null, out error);

    public static bool TrySave(
        string subProgramIdOrName,
        JArray steps,
        JArray variables,
        string? name,
        string? description,
        string? icon,
        out string? error)
    {
        error = null;
        if (!TryLoadForEdit(subProgramIdOrName, out var accessor, out var subProgram, out error))
        {
            return false;
        }

        if (name is not null || description is not null || icon is not null)
        {
            if (!SubProgramPresentationUpdate.TryApply(subProgram!, name, description, icon, out error))
            {
                return false;
            }
        }

        var xAction = BuildXActionForSave(subProgram!, steps, variables);
        return TryPersistLikeActionDesigner(accessor!, subProgram!, xAction, out error);
    }

    public static bool TryUpdatePresentation(
        string subProgramIdOrName,
        string? name,
        string? description,
        string? icon,
        out string? error)
    {
        error = null;
        if (!TryLoadForEdit(subProgramIdOrName, out var accessor, out var subProgram, out error))
        {
            return false;
        }

        if (!SubProgramPresentationUpdate.TryApply(subProgram!, name, description, icon, out error))
        {
            return false;
        }

        var xAction = BuildXActionForSave(
            subProgram!,
            SubProgramProgramSerialization.StepsToJArray(subProgram!.Steps),
            SubProgramProgramSerialization.VariablesToJArray(subProgram.Variables));

        return TryPersistLikeActionDesigner(accessor!, subProgram, xAction, out error);
    }

    private static bool TryLoadForEdit(
        string subProgramIdOrName,
        out DataServiceSubProgramAccessor? accessor,
        out SubProgram? subProgram,
        out string? error)
    {
        accessor = null;
        subProgram = null;
        error = null;

        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            error = "subProgram id or name is required.";
            return false;
        }

        accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            error = "Headless subprogram save unavailable.";
            return false;
        }

        if (!accessor.TryGetByIdOrName(key, out subProgram, out var loadError) || subProgram is null)
        {
            error = loadError ?? $"Subprogram not found: {key}";
            return false;
        }

        return true;
    }

    private static bool TryPersistLikeActionDesigner(
        DataServiceSubProgramAccessor accessor,
        SubProgram live,
        XAction xAction,
        out string? error)
    {
        error = null;
        var subProgramId = live.Id ?? string.Empty;

        // Headless RPC: write catalog directly. Do not simulate designer Ctrl+S (blocks UI for minutes).
        // Open designer refresh is handled by ActionProgramPatchUiGate.ScheduleRefreshOpenDesignerProgram.
        if (DesignerHostSubProgramSave.TrySave(live, xAction, out error))
        {
            return true;
        }

        var merged = SubProgramBodyMerge.Merge(live, xAction);
        if (!accessor.TrySave(merged, out error))
        {
            return false;
        }

        if (!accessor.TryGetByIdOrName(subProgramId, out _, out _))
        {
            error = "save finished but subprogram could not be reloaded.";
            return false;
        }

        return true;
    }

    private static XAction BuildXActionForSave(SubProgram live, JArray steps, JArray variables) =>
        new()
        {
            Steps = SubProgramProgramSerialization.DeserializeSteps(steps),
            Variables = SubProgramProgramSerialization.DeserializeVariables(variables),
            SubPrograms = live.SubPrograms?.ToList() ?? new List<SubProgram>(),
            SummaryExpression = live.SummaryExpression,
        };
}
