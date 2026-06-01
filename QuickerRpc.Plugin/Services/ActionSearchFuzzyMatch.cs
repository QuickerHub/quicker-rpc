using System;
using System.Text;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Fuzzy action title/description matching (e.g. query <c>剪贴板n10</c> matches title <c>剪贴板 n10</c>).
/// </summary>
internal static class ActionSearchFuzzyMatch
{
    public static int ComputeScore(string keyword, string? actionId, string title, string? description)
    {
        var q = (keyword ?? string.Empty).Trim();
        if (q.Length == 0)
        {
            return 1;
        }

        var id = (actionId ?? string.Empty).Trim();
        if (id.Length > 0 && string.Equals(id, q, StringComparison.OrdinalIgnoreCase))
        {
            return 200;
        }

        var titleScore = ScoreText(q, title ?? string.Empty, exact: 150, contains: 100, normalizedExact: 145, normalizedContains: 95);
        var descScore = ScoreText(q, description ?? string.Empty, exact: 0, contains: 0, normalizedExact: 0, normalizedContains: 60);
        if (titleScore > 0)
        {
            return titleScore;
        }

        return descScore;
    }

    private static int ScoreText(
        string keyword,
        string haystack,
        int exact,
        int contains,
        int normalizedExact,
        int normalizedContains)
    {
        if (haystack.Length == 0)
        {
            return 0;
        }

        if (exact > 0 && haystack.Equals(keyword, StringComparison.OrdinalIgnoreCase))
        {
            return exact;
        }

        if (contains > 0 && haystack.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return contains;
        }

        var normalizedKeyword = Normalize(keyword);
        var normalizedHaystack = Normalize(haystack);
        if (normalizedKeyword.Length == 0 || normalizedHaystack.Length == 0)
        {
            return 0;
        }

        if (normalizedExact > 0 && normalizedHaystack.Equals(normalizedKeyword, StringComparison.OrdinalIgnoreCase))
        {
            return normalizedExact;
        }

        if (normalizedContains > 0 && normalizedHaystack.IndexOf(normalizedKeyword, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return normalizedContains;
        }

        if (normalizedKeyword.Length >= 3 && IsSubsequence(normalizedKeyword, normalizedHaystack))
        {
            return Math.Max(normalizedContains - 10, 50);
        }

        return 0;
    }

    /// <summary>Removes whitespace and common separators so <c>剪贴板 n10</c> and <c>剪贴板n10</c> align.</summary>
    internal static string Normalize(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (IsIgnorableSeparator(ch))
            {
                continue;
            }

            sb.Append(char.ToLowerInvariant(ch));
        }

        return sb.ToString();
    }

    private static bool IsIgnorableSeparator(char ch) =>
        char.IsWhiteSpace(ch)
        || ch is '_' or '-' or '.' or '·' or ':' or '/'
        || ch is '（' or '）' or '(' or ')';

    private static bool IsSubsequence(string needle, string haystack)
    {
        var i = 0;
        foreach (var ch in haystack)
        {
            if (ch == needle[i])
            {
                i++;
                if (i == needle.Length)
                {
                    return true;
                }
            }
        }

        return false;
    }
}
