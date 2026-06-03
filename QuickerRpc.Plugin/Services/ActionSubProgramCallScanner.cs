using System;
using System.Collections.Generic;
using Quicker.Common;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.SubPrograms;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.Services;

/// <summary>Find local actions whose XAction steps call a global subprogram.</summary>
internal static class ActionSubProgramCallScanner
{
    public static bool TryResolveSubProgram(
        string subProgramIdOrName,
        out SubProgram? subProgram,
        out string? callIdentifier,
        out string? error)
    {
        subProgram = null;
        callIdentifier = null;
        error = null;

        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            error = "Not running inside Quicker.";
            return false;
        }

        if (!accessor.TryGetByIdOrName(subProgramIdOrName, out subProgram, out error) || subProgram is null)
        {
            error ??= $"Subprogram not found: {subProgramIdOrName}";
            return false;
        }

        callIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram);
        return true;
    }

    public static IReadOnlyList<ActionCatalogEntry> FindActionsCallingSubProgram(string subProgramIdOrName) =>
        FindActionsCallingSubProgram(subProgramIdOrName, exclusiveSubProgramOnly: false);

    public static IReadOnlyList<ActionCatalogEntry> FindActionsDedicatedToSubProgram(string subProgramIdOrName) =>
        FindActionsCallingSubProgram(subProgramIdOrName, exclusiveSubProgramOnly: true);

    private static IReadOnlyList<ActionCatalogEntry> FindActionsCallingSubProgram(
        string subProgramIdOrName,
        bool exclusiveSubProgramOnly)

    {
        if (!TryResolveSubProgram(subProgramIdOrName, out var subProgram, out var callIdentifier, out _)
            || subProgram is null)
        {
            return Array.Empty<ActionCatalogEntry>();
        }

        var matches = new List<ActionCatalogEntry>();
        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope: null))
        {
            if (entry.Action.ActionType != ActionType.XAction)
            {
                continue;
            }

            if (!TryGetBodyJson(entry.Action, entry.Action.Id, out var bodyJson))
            {
                continue;
            }

            if (exclusiveSubProgramOnly)
            {
                if (BodyDedicatedToSubProgram(bodyJson, subProgram, callIdentifier))
                {
                    matches.Add(entry);
                }
            }
            else if (BodyUsesSubProgram(bodyJson, subProgram, callIdentifier))
            {
                matches.Add(entry);
            }
        }

        return matches;
    }

    private static bool BodyDedicatedToSubProgram(string bodyJson, SubProgram subProgram, string? callIdentifier)
    {
        try
        {
            var root = JObject.Parse(bodyJson);
            var steps = ActionProgramContent.ReadBodyArrays(root).Steps;
            if (steps.Count == 0)
            {
                return false;
            }

            var sawTarget = false;
            foreach (var step in steps)
            {
                if (step is not JObject stepObj)
                {
                    return false;
                }

                var runnerKey = (stepObj["stepRunnerKey"] ?? stepObj["StepRunnerKey"])?.ToString();
                if (!string.Equals(runnerKey, "sys:subprogram", StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                var subProgramValue = ReadSubProgramParamValue(stepObj);
                if (string.IsNullOrWhiteSpace(subProgramValue))
                {
                    return false;
                }

                if (MatchesSubProgramReference(subProgramValue, subProgram, callIdentifier))
                {
                    sawTarget = true;
                    continue;
                }

                return false;
            }

            return sawTarget;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryGetBodyJson(ActionItem action, string? actionId, out string? bodyJson)
    {
        bodyJson = null;
        if (ActionProgramContent.HasProgramContent(action.Data))
        {
            bodyJson = action.Data;
            return true;
        }

        var id = (actionId ?? action.Id ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return false;
        }

        if (SharedActionProgramAccessor.TryGetFromSharedCache(action, id, out bodyJson, out _))
        {
            return !string.IsNullOrWhiteSpace(bodyJson);
        }

        return SharedActionProgramAccessor.TryGetPayloadFromLegacyFallbacks(id, out bodyJson)
            && !string.IsNullOrWhiteSpace(bodyJson);
    }

    private static bool BodyUsesSubProgram(string bodyJson, SubProgram subProgram, string? callIdentifier)
    {
        try
        {
            var root = JObject.Parse(bodyJson);
            var steps = ActionProgramContent.ReadBodyArrays(root).Steps;
            foreach (var step in steps)
            {
                if (step is not JObject stepObj)
                {
                    continue;
                }

                var runnerKey = (stepObj["stepRunnerKey"] ?? stepObj["StepRunnerKey"])?.ToString();
                if (!string.Equals(runnerKey, "sys:subprogram", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var subProgramValue = ReadSubProgramParamValue(stepObj);
                if (string.IsNullOrWhiteSpace(subProgramValue))
                {
                    continue;
                }

                if (MatchesSubProgramReference(subProgramValue, subProgram, callIdentifier))
                {
                    return true;
                }
            }
        }
        catch
        {
            return false;
        }

        return false;
    }

    private static string? ReadSubProgramParamValue(JObject stepObj)
    {
        var inputParams = (stepObj["inputParams"] ?? stepObj["InputParams"]) as JObject;
        if (inputParams is null)
        {
            return null;
        }

        var subProgramToken = inputParams["subProgram"] ?? inputParams["SubProgram"];
        if (subProgramToken is null)
        {
            return null;
        }

        if (subProgramToken is JObject subProgramObj)
        {
            return subProgramObj["value"]?.ToString() ?? subProgramObj["Value"]?.ToString();
        }

        return subProgramToken.ToString();
    }

    private static bool MatchesSubProgramReference(
        string reference,
        SubProgram subProgram,
        string? callIdentifier)
    {
        var trimmed = reference.Trim();
        if (trimmed.Length == 0)
        {
            return false;
        }

        var subProgramId = (subProgram.Id ?? string.Empty).Trim();
        var subProgramName = (subProgram.Name ?? string.Empty).Trim();
        var callId = (callIdentifier ?? string.Empty).Trim();

        if (string.Equals(trimmed, subProgramName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (subProgramId.Length > 0
            && trimmed.IndexOf(subProgramId, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return true;
        }

        if (callId.Length > 0)
        {
            var normalized = trimmed.TrimStart('%');
            var normalizedCallId = callId.TrimStart('%');
            if (string.Equals(normalized, normalizedCallId, StringComparison.OrdinalIgnoreCase)
                || string.Equals(trimmed, callId, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
