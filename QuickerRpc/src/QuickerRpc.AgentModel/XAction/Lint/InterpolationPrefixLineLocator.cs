using System;
using System.Text.Json;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Map a JSON string literal back to 1-based line ranges in data.json.</summary>
internal static class InterpolationPrefixLineLocator
{
    internal static (int StartLine, int EndLine)? LineRangeForValueLiteral(
        string jsonText,
        string? paramName,
        string value)
    {
        if (string.IsNullOrEmpty(jsonText) || string.IsNullOrEmpty(value))
        {
            return null;
        }

        var quoted = JsonSerializer.Serialize(value);
        var indices = new System.Collections.Generic.List<int>();
        var pos = 0;
        while (pos < jsonText.Length)
        {
            var idx = jsonText.IndexOf(quoted, pos, StringComparison.Ordinal);
            if (idx < 0)
            {
                break;
            }

            indices.Add(idx);
            pos = idx + Math.Max(quoted.Length, 1);
        }

        var pick = indices.Count > 0 ? indices[0] : -1;
        if (indices.Count > 1 && !string.IsNullOrWhiteSpace(paramName))
        {
            var anchor = $"\"{paramName}\"";
            foreach (var idx in indices)
            {
            var windowStart = Math.Max(0, idx - 120);
            if (jsonText.IndexOf(anchor, windowStart, idx - windowStart, StringComparison.Ordinal) >= 0)
                {
                    pick = idx;
                    break;
                }
            }
        }

        if (pick < 0)
        {
            pick = jsonText.IndexOf(value, StringComparison.Ordinal);
            if (pick < 0)
            {
                return null;
            }

            var endIdx = pick + value.Length;
            return (
                Math.Max(1, CharIndexToLine(jsonText, pick) - 2),
                CharIndexToLine(jsonText, endIdx) + 2);
        }

        var end = pick + quoted.Length;
        return (
            Math.Max(1, CharIndexToLine(jsonText, pick) - 2),
            CharIndexToLine(jsonText, end) + 2);
    }

    private static int CharIndexToLine(string text, int index)
    {
        if (index <= 0)
        {
            return 1;
        }

        var line = 1;
        var limit = Math.Min(index, text.Length);
        for (var i = 0; i < limit; i++)
        {
            if (text[i] == '\n')
            {
                line++;
            }
        }

        return line;
    }
}
