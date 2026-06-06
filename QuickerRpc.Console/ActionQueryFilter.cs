namespace QuickerRpc.Console;

using System.IO;
using System.Text;

internal static class ActionQueryFilter
{
    public static bool TryResolveQuery(
        string? query,
        string? queryFile,
        string? filter,
        out string resolved,
        out string? error)
    {
        resolved = string.Empty;
        error = null;

        if (!string.IsNullOrWhiteSpace(queryFile))
        {
            if (!File.Exists(queryFile))
            {
                error = $"Query file not found: {queryFile}";
                return false;
            }

            query = File.ReadAllText(queryFile, Encoding.UTF8);
        }

        if (!TryNormalizeFilter(filter, out _, out error))
        {
            return false;
        }

        resolved = MergeFilter(filter, query);
        return true;
    }

    public static string MergeFilter(string? filter, string? query)
    {
        var normalizedFilter = NormalizeFilter(filter);
        var normalizedQuery = (query ?? string.Empty).Trim();
        if (normalizedFilter is null)
        {
            return normalizedQuery;
        }

        if (normalizedQuery.StartsWith("{", StringComparison.Ordinal))
        {
            return normalizedQuery;
        }

        if (normalizedQuery.Length == 0)
        {
            return normalizedFilter;
        }

        if (normalizedQuery.StartsWith(normalizedFilter, StringComparison.OrdinalIgnoreCase))
        {
            return normalizedQuery;
        }

        return $"{normalizedFilter} {normalizedQuery}";
    }

    public static bool TryNormalizeFilter(string? filter, out string? normalized, out string? error)
    {
        normalized = NormalizeFilter(filter);
        if (filter is null || filter.Trim().Length == 0)
        {
            error = null;
            return true;
        }

        if (normalized is not null)
        {
            error = null;
            return true;
        }

        error = "filter must be library|installed|local|published (or shared:<guid> via --query).";
        return false;
    }

    private static string? NormalizeFilter(string? filter)
    {
        var value = (filter ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return null;
        }

        return value.ToLowerInvariant() switch
        {
            "library" or "installed" => "source:library",
            "local" => "source:local",
            "published" => "source:published",
            _ => null,
        };
    }
}
