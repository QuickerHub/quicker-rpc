using System;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>Detects <c>sys:subprogram</c> steps that reference a target global subprogram.</summary>
internal static class SubProgramStepReferenceMatcher
{
    public static bool StepsUseSubProgram(JArray steps, SubProgram subProgram, string? callIdentifier)
    {
        if (steps is null || steps.Count == 0)
        {
            return false;
        }

        foreach (var step in steps)
        {
            if (step is not JObject stepObj)
            {
                continue;
            }

            if (!IsSubProgramStep(stepObj))
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

        return false;
    }

    /// <summary>All steps are sys:subprogram calls and at least one targets the subprogram (dedicated wrapper).</summary>
    public static bool StepsDedicatedToSubProgram(JArray steps, SubProgram subProgram, string? callIdentifier)
    {
        if (steps is null || steps.Count == 0)
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

            if (!IsSubProgramStep(stepObj))
            {
                return false;
            }

            var subProgramValue = ReadSubProgramParamValue(stepObj);
            if (string.IsNullOrWhiteSpace(subProgramValue))
            {
                return false;
            }

            if (MatchesSubProgramReference(subProgramValue!, subProgram, callIdentifier))
            {
                sawTarget = true;
                continue;
            }

            return false;
        }

        return sawTarget;
    }

    public static bool MatchesSubProgramReference(
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

    private static bool IsSubProgramStep(JObject stepObj)
    {
        var runnerKey = (stepObj["stepRunnerKey"] ?? stepObj["StepRunnerKey"])?.ToString();
        return string.Equals(runnerKey, "sys:subprogram", StringComparison.OrdinalIgnoreCase);
    }

    public static string? ReadSubProgramParamValue(JObject stepObj)
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
}
