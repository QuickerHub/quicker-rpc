using System;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Agent search visibility from <c>step-runner-agent-keywords.json</c>.
/// Does not affect <see cref="StepRunnerCatalogMapper.GetDetail"/>.
/// </summary>
public static class StepRunnerAgentSearchFilter
{
    public static bool IsModuleExcludedFromSearch(string? stepRunnerKey)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        if (key.Length == 0
            || !StepRunnerAgentKeywordCatalog.TryGet(key, out var entry))
        {
            return false;
        }

        return entry.Obsolete;
    }

    public static bool IsModuleExcludedFromSearch(StepRunnerDefinition row) =>
        IsModuleExcludedFromSearch(row.Key);

    public static bool IsControlValueExcludedFromSearch(string? stepRunnerKey, string? controlValue)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        var value = (controlValue ?? string.Empty).Trim();
        if (key.Length == 0
            || value.Length == 0
            || !StepRunnerAgentKeywordCatalog.TryGet(key, out var entry)
            || entry.ObsoleteControlValues.Count == 0)
        {
            return false;
        }

        foreach (var obsolete in entry.ObsoleteControlValues)
        {
            if (string.Equals(obsolete?.Trim(), value, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
