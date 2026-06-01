using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.AgentModel.XAction.Validation;

/// <summary>
/// Collects <c>inputParams</c> key warnings against the StepRunner catalog (after key normalization).
/// </summary>
public static class StepInputParamsValidator
{
    private const int MaxWarnings = 8;
    private const int MaxValidKeysListed = 16;
    private const int SuggestMaxEditDistance = 4;

    public static IList<string> CollectWarnings(JArray steps, StepRunnerCatalog? catalog)
    {
        if (catalog is null || catalog.Items.Count == 0)
        {
            return Array.Empty<string>();
        }

        var warnings = new List<string>();
        CollectWarningsRecursive(steps, catalog, warnings);
        return warnings;
    }

    private static void CollectWarningsRecursive(JArray steps, StepRunnerCatalog catalog, List<string> warnings)
    {
        foreach (var token in steps)
        {
            if (token is not JObject stepObj)
            {
                continue;
            }

            CollectStepWarnings(stepObj, catalog, warnings);
            if (warnings.Count >= MaxWarnings)
            {
                return;
            }

            if (stepObj["ifSteps"] is JArray ifSteps)
            {
                CollectWarningsRecursive(ifSteps, catalog, warnings);
            }

            if (stepObj["elseSteps"] is JArray elseSteps)
            {
                CollectWarningsRecursive(elseSteps, catalog, warnings);
            }
        }
    }

    private static void CollectStepWarnings(JObject step, StepRunnerCatalog catalog, List<string> warnings)
    {
        var runnerKey = (step.Value<string>("stepRunnerKey") ?? string.Empty).Trim();
        if (runnerKey.Length == 0)
        {
            return;
        }

        var stepRef = FormatStepRef(step);
        var runner = catalog.TryFind(runnerKey);
        if (runner is null)
        {
            if (warnings.Count < MaxWarnings)
            {
                warnings.Add(
                    $"step {stepRef}: stepRunnerKey '{runnerKey}' not in catalog; run qkrpc step-runner search --query <keyword> --json.");
            }

            return;
        }

        if (step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        var validKeys = runner.InputParamDefs
            .Select(d => (d.Key ?? string.Empty).Trim())
            .Where(k => k.Length > 0)
            .ToList();
        var validByLower = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var k in validKeys)
        {
            validByLower[k] = k;
        }

        foreach (var prop in inputParams.Properties())
        {
            if (prop.Value is null || prop.Value.Type == JTokenType.Null)
            {
                continue;
            }

            if (validByLower.ContainsKey(prop.Name))
            {
                continue;
            }

            if (warnings.Count >= MaxWarnings)
            {
                return;
            }

            warnings.Add(FormatUnknownKeyWarning(stepRef, runnerKey, prop.Name, validKeys));
        }
    }

    private static string FormatUnknownKeyWarning(
        string stepRef,
        string runnerKey,
        string unknownKey,
        IReadOnlyList<string> validKeys)
    {
        var sb = new StringBuilder();
        sb.Append("step ").Append(stepRef).Append(" (").Append(runnerKey).Append("): inputParams key '")
            .Append(unknownKey).Append("' is not in schema.");

        if (validKeys.Count > 0)
        {
            sb.Append(" Valid keys: ").Append(FormatKeyList(validKeys)).Append('.');
        }

        var suggestion = SuggestClosestKey(unknownKey, validKeys);
        if (suggestion is not null)
        {
            sb.Append(" Did you mean '").Append(suggestion).Append("'?");
        }

        sb.Append(" Run qkrpc step-runner get --key ").Append(runnerKey).Append(" --json.");
        return sb.ToString();
    }

    private static string FormatKeyList(IReadOnlyList<string> validKeys)
    {
        if (validKeys.Count <= MaxValidKeysListed)
        {
            return string.Join(", ", validKeys);
        }

        return string.Join(", ", validKeys.Take(MaxValidKeysListed)) + ", …";
    }

    private static string? SuggestClosestKey(string unknown, IReadOnlyList<string> validKeys)
    {
        if (validKeys.Count == 0)
        {
            return null;
        }

        var lower = unknown.Trim().ToLowerInvariant();
        string? best = null;
        var bestDistance = int.MaxValue;

        foreach (var key in validKeys)
        {
            var candidate = key.Trim();
            if (candidate.Length == 0)
            {
                continue;
            }

            var candidateLower = candidate.ToLowerInvariant();
            if (candidateLower.Contains(lower) || lower.Contains(candidateLower))
            {
                return candidate;
            }

            var distance = LevenshteinDistance(lower, candidateLower);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = candidate;
            }
        }

        return bestDistance <= SuggestMaxEditDistance ? best : null;
    }

    private static string FormatStepRef(JObject step)
    {
        var stepId = (step.Value<string>("stepId") ?? step.Value<string>("id") ?? string.Empty).Trim();
        return stepId.Length > 0 ? stepId : "(no stepId)";
    }

    private static int LevenshteinDistance(string a, string b)
    {
        if (a.Length == 0)
        {
            return b.Length;
        }

        if (b.Length == 0)
        {
            return a.Length;
        }

        var prev = new int[b.Length + 1];
        var curr = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++)
        {
            prev[j] = j;
        }

        for (var i = 1; i <= a.Length; i++)
        {
            curr[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(
                    Math.Min(curr[j - 1] + 1, prev[j] + 1),
                    prev[j - 1] + cost);
            }

            (prev, curr) = (curr, prev);
        }

        return prev[b.Length];
    }
}
