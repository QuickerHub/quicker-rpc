namespace QuickerRpc.Console;

using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json.Nodes;
using QuickerRpc.Contracts.Rpc;

internal static class ActionQueryFilter
{
    public static bool TryResolveQuery(
        string? query,
        string? queryFile,
        string? filter,
        string? fields,
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

        if (!ActionSummaryFieldCatalog.TryParseCsv(fields, out var parsedFields, out error))
        {
            return false;
        }

        resolved = MergeFilter(filter, query);
        if (parsedFields.Count > 0)
        {
            resolved = MergeFields(parsedFields, resolved);
        }

        return true;
    }

    public static string MergeFields(IReadOnlyList<string> fields, string query)
    {
        if (fields.Count == 0)
        {
            return query;
        }

        var fieldsArray = new JsonArray();
        foreach (var field in fields)
        {
            fieldsArray.Add(field);
        }

        var trimmed = (query ?? string.Empty).Trim();
        if (trimmed.StartsWith("{", StringComparison.Ordinal))
        {
            var node = JsonNode.Parse(trimmed) as JsonObject ?? new JsonObject();
            node["fields"] = fieldsArray;
            return node.ToJsonString();
        }

        var obj = new JsonObject { ["fields"] = fieldsArray };
        if (trimmed.Length > 0)
        {
            obj["keyword"] = trimmed;
        }

        return obj.ToJsonString();
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
