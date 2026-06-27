using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.AgentModel.XAction.Validation;

/// <summary>sys:subprogram wire keys — dynamic <c>var:&lt;ioKey&gt;</c> params are not in static step-runner schema.</summary>
public static class SubProgramStepWireKeys
{
    internal const string StepRunnerKey = "sys:subprogram";
    internal const string SubProgramParamKey = "subProgram";
    internal const string VarKeyPrefix = "var:";

    public static bool IsSubProgramStep(string runnerKey) =>
        string.Equals(runnerKey, StepRunnerKey, StringComparison.OrdinalIgnoreCase);

    public static bool IsSubProgramVarParamKey(string key) =>
        key.StartsWith(VarKeyPrefix, StringComparison.OrdinalIgnoreCase);

    public static string? ReadSubProgramIdentifier(JObject step)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return null;
        }

        var subProgramToken = inputParams["subProgram"] ?? inputParams["SubProgram"];
        if (subProgramToken is null || subProgramToken.Type == JTokenType.Null)
        {
            return null;
        }

        if (subProgramToken is JObject subProgramObj)
        {
            var varKey = (subProgramObj["varKey"] ?? subProgramObj["VarKey"])?.ToString()?.Trim();
            if (!string.IsNullOrEmpty(varKey))
            {
                return null;
            }

            return (subProgramObj["value"] ?? subProgramObj["Value"])?.ToString()?.Trim();
        }

        return subProgramToken.ToString()?.Trim();
    }

    public static IReadOnlyList<string> CollectInputVarKeys(JArray? variables)
    {
        if (variables is null || variables.Count == 0)
        {
            return Array.Empty<string>();
        }

        var keys = new List<string>();
        foreach (var token in variables)
        {
            if (token is not JObject variable)
            {
                continue;
            }

            if (!ReadBool(variable, "isInput", "IsInput"))
            {
                continue;
            }

            var key = (variable["key"] ?? variable["Key"])?.ToString()?.Trim();
            if (string.IsNullOrEmpty(key))
            {
                continue;
            }

            keys.Add(VarKeyPrefix + key);
        }

        return keys;
    }

    public static bool TryResolveSubProgramInputVarKeys(
        string identifier,
        StepInputParamsValidationContext? context,
        out IReadOnlyList<string> inputVarKeys)
    {
        inputVarKeys = Array.Empty<string>();
        if (string.IsNullOrWhiteSpace(identifier) || context is null)
        {
            return false;
        }

        var variables = TryFindEmbeddedSubProgramVariables(context.EmbeddedSubPrograms, identifier);
        if (variables is null && context.ResolveGlobalSubProgramInputVarKeys is not null)
        {
            inputVarKeys = context.ResolveGlobalSubProgramInputVarKeys.Invoke(identifier)
                ?? Array.Empty<string>();
            return inputVarKeys.Count > 0;
        }

        if (variables is null && !string.IsNullOrWhiteSpace(context.WorkspaceRoot))
        {
            var load = WorkspaceActionTestEnvironment.TryLoadSubProgram(identifier, context.WorkspaceRoot);
            if (load.Success && load.Project?.CompiledData["variables"] is JArray workspaceVariables)
            {
                variables = workspaceVariables;
            }
        }

        if (variables is null)
        {
            return false;
        }

        inputVarKeys = CollectInputVarKeys(variables);
        return true;
    }

    private static JArray? TryFindEmbeddedSubProgramVariables(JArray? embeddedSubPrograms, string identifier)
    {
        if (embeddedSubPrograms is null || embeddedSubPrograms.Count == 0)
        {
            return null;
        }

        return TryFindEmbeddedSubProgramVariablesRecursive(embeddedSubPrograms, identifier);
    }

    private static JArray? TryFindEmbeddedSubProgramVariablesRecursive(JArray subPrograms, string identifier)
    {
        foreach (var token in subPrograms)
        {
            if (token is not JObject subProgram)
            {
                continue;
            }

            if (MatchesSubProgramReference(identifier, subProgram))
            {
                return subProgram["variables"] as JArray ?? subProgram["Variables"] as JArray;
            }

            var nested = subProgram["subPrograms"] as JArray ?? subProgram["SubPrograms"] as JArray;
            if (nested is { Count: > 0 })
            {
                var nestedMatch = TryFindEmbeddedSubProgramVariablesRecursive(nested, identifier);
                if (nestedMatch is not null)
                {
                    return nestedMatch;
                }
            }
        }

        return null;
    }

    private static bool MatchesSubProgramReference(string reference, JObject subProgram)
    {
        var trimmed = reference.Trim();
        if (trimmed.Length == 0)
        {
            return false;
        }

        var id = ReadString(subProgram, "id", "Id");
        var name = ReadString(subProgram, "name", "Name");
        var callId = ReadString(subProgram, "callIdentifier", "CallIdentifier");

        if (!string.IsNullOrEmpty(name)
            && string.Equals(trimmed, name, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!string.IsNullOrEmpty(id)
            && (string.Equals(trimmed, id, StringComparison.OrdinalIgnoreCase)
                || trimmed.IndexOf(id, StringComparison.OrdinalIgnoreCase) >= 0))
        {
            return true;
        }

        if (!string.IsNullOrEmpty(callId))
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

    private static string? ReadString(JObject obj, string camel, string pascal) =>
        (obj[camel] ?? obj[pascal])?.ToString()?.Trim();

    private static bool ReadBool(JObject obj, string camel, string pascal)
    {
        var token = obj[camel] ?? obj[pascal];
        return token is not null && token.Type != JTokenType.Null && token.Value<bool>();
    }
}
