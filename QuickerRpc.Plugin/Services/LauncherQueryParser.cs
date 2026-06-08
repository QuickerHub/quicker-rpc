using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parses launcher resolve queries: <c>|</c> alternatives and <c>*</c> wildcards.
/// </summary>
internal static class LauncherQueryParser
{
    public static IReadOnlyList<string> ParseAlternatives(string? raw)
    {
        var text = (raw ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return Array.Empty<string>();
        }

        return text
            .Split('|')
            .Select(part => part.Trim())
            .Where(part => part.Length > 0)
            .ToList();
    }

    /// <summary>Keyword passed to underlying search APIs (wildcards stripped).</summary>
    public static string ToSearchKeyword(string term)
    {
        var stripped = (term ?? string.Empty).Replace("*", string.Empty);
        return Regex.Replace(stripped.Trim(), @"\s+", " ");
    }

    public static bool Matches(string term, string? text)
    {
        var pattern = (term ?? string.Empty).Trim();
        var haystack = (text ?? string.Empty).Trim();
        if (pattern.Length == 0 || haystack.Length == 0)
        {
            return false;
        }

        if (pattern.IndexOf('*') < 0)
        {
            return ContainsIgnoreCase(haystack, pattern)
                   || ContainsIgnoreCase(pattern, haystack);
        }

        var regexPattern = "^"
            + Regex.Escape(pattern).Replace("\\*", ".*")
            + "$";
        return Regex.IsMatch(haystack, regexPattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    /// <summary>Best matching field label for agent attribution.</summary>
    public static string? FindMatchedOn(string queryTerm, params (string Field, string? Value)[] fields)
    {
        foreach (var (field, value) in fields)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (Matches(queryTerm, value))
            {
                return $"{field}: {value.Trim()}";
            }
        }

        return null;
    }

    private static bool ContainsIgnoreCase(string haystack, string needle) =>
        haystack.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0;
}
