using System;
using System.Collections.Generic;
using System.Text;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Builds <see cref="StepRunnerRetrievalDocument"/> from catalog rows and curated keywords.</summary>
public static class StepRunnerRetrievalBuilder
{
    public static StepRunnerRetrievalDocument Build(StepRunnerDefinition row) =>
        BuildCore(row, includeControlSelections: true);

    /// <summary>Module-level retrieval text (excludes control selection labels from ranking).</summary>
    public static StepRunnerRetrievalDocument BuildModuleOnly(StepRunnerDefinition row) =>
        BuildCore(row, includeControlSelections: false);

    private static StepRunnerRetrievalDocument BuildCore(
        StepRunnerDefinition row,
        bool includeControlSelections)
    {
        var key = row.Key ?? string.Empty;
        StepRunnerAgentKeywordCatalog.TryGet(key, out var meta);
        meta ??= new StepRunnerAgentKeywordEntry();

        var parts = new List<string>
        {
            key,
            row.Name ?? string.Empty,
            row.Description ?? string.Empty,
            row.Category ?? string.Empty,
        };

        foreach (var kw in meta.Keywords)
        {
            if (!string.IsNullOrWhiteSpace(kw))
            {
                parts.Add(kw);
            }
        }

        if (includeControlSelections)
        {
            var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
            if (control is not null)
            {
                foreach (var si in control.SelectionItems)
                {
                    parts.Add(si.Name ?? string.Empty);
                    parts.Add(si.Value ?? string.Empty);
                    parts.Add(si.Description ?? string.Empty);
                }
            }
        }

        var searchable = string.Join("\n", parts).ToLowerInvariant();
        return new StepRunnerRetrievalDocument
        {
            Key = key,
            Name = row.Name ?? string.Empty,
            Description = row.Description ?? string.Empty,
            Category = row.Category ?? string.Empty,
            AgentKeywords = meta.Keywords ?? new List<string>(),
            NotFor = meta.NotFor ?? new List<string>(),
            Snippet = TrimToNull(meta.Snippet) ?? TrimToNull(row.Description),
            RankBias = meta.RankBias,
            ControlRankBias = CopyControlRankBias(meta.ControlRankBias),
            ControlKeywords = CopyControlKeywords(meta.ControlKeywords),
            SearchableText = searchable,
        };
    }

    public static IReadOnlyList<string> GetControlKeywords(
        StepRunnerRetrievalDocument doc,
        string? controlValue)
    {
        var value = (controlValue ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return Array.Empty<string>();
        }

        return doc.ControlKeywords.TryGetValue(value, out var keywords) && keywords.Count > 0
            ? keywords
            : Array.Empty<string>();
    }

    private static Dictionary<string, IReadOnlyList<string>> CopyControlKeywords(
        Dictionary<string, List<string>>? source)
    {
        if (source is null || source.Count == 0)
        {
            return new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        }

        var map = new Dictionary<string, IReadOnlyList<string>>(source.Count, StringComparer.Ordinal);
        foreach (var pair in source)
        {
            var value = (pair.Key ?? string.Empty).Trim();
            if (value.Length == 0 || pair.Value is null || pair.Value.Count == 0)
            {
                continue;
            }

            var list = new List<string>();
            foreach (var kw in pair.Value)
            {
                if (!string.IsNullOrWhiteSpace(kw))
                {
                    list.Add(kw.Trim());
                }
            }

            if (list.Count > 0)
            {
                map[value] = list;
            }
        }

        return map;
    }

    private static Dictionary<string, int> CopyControlRankBias(Dictionary<string, int>? source)
    {
        if (source is null || source.Count == 0)
        {
            return new Dictionary<string, int>(StringComparer.Ordinal);
        }

        var map = new Dictionary<string, int>(source.Count, StringComparer.Ordinal);
        foreach (var pair in source)
        {
            var value = (pair.Key ?? string.Empty).Trim();
            if (value.Length > 0)
            {
                map[value] = pair.Value;
            }
        }

        return map;
    }

    /// <summary>Extra lines appended to legacy match surface (curated keywords only; notFor is score-only).</summary>
    public static string GetKeywordExtensions(StepRunnerDefinition row)
    {
        var doc = Build(row);
        if (doc.AgentKeywords.Count == 0)
        {
            return string.Empty;
        }

        var sb = new StringBuilder();
        foreach (var kw in doc.AgentKeywords)
        {
            if (!string.IsNullOrWhiteSpace(kw))
            {
                sb.AppendLine(kw);
            }
        }

        return sb.ToString();
    }

    private static string? TrimToNull(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }
}
