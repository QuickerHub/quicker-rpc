using System;
using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Tiered exact/contains scoring for linear region scans.</summary>
public static class TextMatchScorer
{
    public sealed class FieldRule
    {
        public string? Value { get; set; }

        public int ExactScore { get; set; }

        public int ContainsScore { get; set; }
    }

    public static int Score(string keyword, IReadOnlyList<FieldRule> fields)
    {
        var kw = (keyword ?? string.Empty).Trim();
        if (kw.Length == 0)
        {
            return 0;
        }

        var best = 0;
        foreach (var field in fields)
        {
            var value = field.Value ?? string.Empty;
            if (value.Length == 0)
            {
                continue;
            }

            if (field.ExactScore > 0 && value.Equals(kw, StringComparison.OrdinalIgnoreCase))
            {
                best = Math.Max(best, field.ExactScore);
                continue;
            }

            if (field.ContainsScore > 0 && value.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                best = Math.Max(best, field.ContainsScore);
            }
        }

        return best;
    }
}
