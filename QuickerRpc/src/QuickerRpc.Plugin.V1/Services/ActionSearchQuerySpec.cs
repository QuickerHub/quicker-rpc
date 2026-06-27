using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parsed action list/search query. Plain text keeps legacy behavior; JSON uses <c>filter</c> / <c>sort</c> objects.
/// </summary>
internal sealed class ActionSearchQuerySpec
{
    public string? Keyword { get; set; }

    public string? FilterScript { get; set; }

    public IReadOnlyList<ActionSearchSortRule> SortRules { get; set; } = Array.Empty<ActionSearchSortRule>();

    public IReadOnlyList<string> Fields { get; set; } = Array.Empty<string>();

    public ActionSourceFilter? SourceFilter { get; set; }

    public SubProgramReferenceSearch? SubProgramSearch { get; set; }

    public bool IsJsonQuery { get; set; }

    public bool IsEmpty =>
        string.IsNullOrWhiteSpace(Keyword)
        && string.IsNullOrWhiteSpace(FilterScript)
        && SortRules.Count == 0
        && SourceFilter is null
        && SubProgramSearch is null;

    public bool HasFilterScript => !string.IsNullOrWhiteSpace(FilterScript);

    public bool HasSortScript => SortRules.Count > 0;

    public bool UsesScript => HasFilterScript || HasSortScript;

    public bool ApplyXActionCatalogFilter =>
        !UsesScript
        && SourceFilter is null
        && SubProgramSearch is null
        && !string.IsNullOrWhiteSpace(Keyword);

    public static bool TryParse(string? raw, out ActionSearchQuerySpec spec, out string? error)
    {
        spec = new ActionSearchQuerySpec();
        error = null;
        var text = (raw ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return true;
        }

        if (text.StartsWith("{", StringComparison.Ordinal))
        {
            if (!text.EndsWith("}", StringComparison.Ordinal))
            {
                error = "Invalid JSON query: unclosed object.";
                return false;
            }

            return TryParseJson(text, spec, out error);
        }

        return TryParseLegacy(text, spec, out error);
    }

    private static bool TryParseLegacy(string text, ActionSearchQuerySpec spec, out string? error)
    {
        error = null;
        if (ActionSearchQuery.TryParseSourceFilter(text, out var sourceFilter, out var keyword))
        {
            spec.SourceFilter = sourceFilter;
            spec.Keyword = string.IsNullOrWhiteSpace(keyword) ? null : keyword;
            return true;
        }

        if (ActionSearchQuery.TryParseSubProgramReference(text, out var subProgramSearch))
        {
            spec.SubProgramSearch = subProgramSearch;
            return true;
        }

        spec.Keyword = text;
        return true;
    }

    private static bool TryParseJson(string json, ActionSearchQuerySpec spec, out string? error)
    {
        error = null;
        spec.IsJsonQuery = true;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                error = "Query JSON must be an object.";
                return false;
            }

            var root = doc.RootElement;
            spec.Keyword = ReadOptionalString(root, "keyword", "q", "text");

            if (!TryReadFilter(root, spec, out error))
            {
                return false;
            }

            if (!TryReadSortRules(root, out var sortRules, out error))
            {
                return false;
            }

            spec.SortRules = sortRules;

            if (!TryReadFields(root, out var fields, out error))
            {
                return false;
            }

            spec.Fields = fields;
            return true;
        }
        catch (JsonException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool TryReadFilter(JsonElement root, ActionSearchQuerySpec spec, out string? error)
    {
        error = null;

        if (root.TryGetProperty("filter", out var filterElement))
        {
            switch (filterElement.ValueKind)
            {
                case JsonValueKind.String:
                {
                    var script = filterElement.GetString();
                    if (!string.IsNullOrWhiteSpace(script))
                    {
                        spec.FilterScript = script.Trim();
                    }

                    break;
                }
                case JsonValueKind.Object:
                    if (!TryReadFilterObject(filterElement, spec, out error))
                    {
                        return false;
                    }

                    break;
                default:
                    error = "filter must be a string script or an object.";
                    return false;
            }
        }

        // Legacy top-level fields (fill gaps only).
        if (spec.SourceFilter is null && TryReadSourceFilter(root, out var rootSource))
        {
            spec.SourceFilter = rootSource;
        }

        if (spec.SubProgramSearch is null && TryReadSubProgramSearch(root, out var rootUses))
        {
            spec.SubProgramSearch = rootUses;
        }

        return true;
    }

    private static bool TryReadFilterObject(JsonElement filter, ActionSearchQuerySpec spec, out string? error)
    {
        error = null;

        if (TryReadSourceFilter(filter, out var sourceFilter))
        {
            spec.SourceFilter = sourceFilter;
        }

        if (TryReadSubProgramSearch(filter, out var subProgramSearch))
        {
            spec.SubProgramSearch = subProgramSearch;
        }

        var filterKeyword = ReadOptionalString(filter, "keyword", "q", "text");
        if (!string.IsNullOrWhiteSpace(filterKeyword))
        {
            spec.Keyword = filterKeyword;
        }

        var script = ReadFilterScript(filter);
        if (!string.IsNullOrWhiteSpace(script))
        {
            spec.FilterScript = string.IsNullOrWhiteSpace(spec.FilterScript)
                ? script
                : spec.FilterScript;
        }

        return true;
    }

    private static string? ReadFilterScript(JsonElement filter)
    {
        foreach (var name in new[] { "script", "expr", "where" })
        {
            if (filter.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
            {
                return value.GetString()?.Trim();
            }
        }

        return null;
    }

    private static bool TryReadSortRules(
        JsonElement root,
        out IReadOnlyList<ActionSearchSortRule> rules,
        out string? error)
    {
        rules = Array.Empty<ActionSearchSortRule>();
        error = null;

        JsonElement? sortElement = null;
        if (root.TryGetProperty("sort", out var sortProp))
        {
            sortElement = sortProp;
        }
        else if (root.TryGetProperty("sorter", out var sorterProp))
        {
            sortElement = sorterProp;
        }

        if (sortElement is null)
        {
            return true;
        }

        return TryParseSortElement(sortElement.Value, root, out rules, out error);
    }

    private static bool TryParseSortElement(
        JsonElement element,
        JsonElement root,
        out IReadOnlyList<ActionSearchSortRule> rules,
        out string? error)
    {
        rules = Array.Empty<ActionSearchSortRule>();
        error = null;

        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                return TryParseSortString(element.GetString(), root, out rules);
            case JsonValueKind.Object:
                if (element.TryGetProperty("by", out var byElement)
                    || element.TryGetProperty("keys", out byElement))
                {
                    return TryParseSortArray(byElement, out rules, out error);
                }

                return TryParseSortRule(element, root, out rules, out error);
            case JsonValueKind.Array:
                return TryParseSortArray(element, out rules, out error);
            default:
                error = "sort must be a string, object, or array.";
                return false;
        }
    }

    private static bool TryParseSortString(
        string? sortText,
        JsonElement root,
        out IReadOnlyList<ActionSearchSortRule> rules)
    {
        rules = Array.Empty<ActionSearchSortRule>();
        if (string.IsNullOrWhiteSpace(sortText))
        {
            return true;
        }

        sortText = sortText.Trim();
        if (ActionSearchSortShorthand.TryParse(sortText, out var shorthandRule))
        {
            rules = new[] { shorthandRule };
            return true;
        }

        var descending = ReadOptionalBool(root, "desc", "sortDesc", "descending") ?? false;
        rules = new[] { new ActionSearchSortRule(sortText, descending) };
        return true;
    }

    private static bool TryParseSortArray(
        JsonElement arrayElement,
        out IReadOnlyList<ActionSearchSortRule> rules,
        out string? error)
    {
        rules = Array.Empty<ActionSearchSortRule>();
        error = null;

        if (arrayElement.ValueKind != JsonValueKind.Array)
        {
            error = "sort.by must be an array.";
            return false;
        }

        var list = new List<ActionSearchSortRule>();
        foreach (var item in arrayElement.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                var sortText = item.GetString();
                if (string.IsNullOrWhiteSpace(sortText))
                {
                    continue;
                }

                sortText = sortText.Trim();
                if (ActionSearchSortShorthand.TryParse(sortText, out var shorthandRule))
                {
                    list.Add(shorthandRule);
                }
                else
                {
                    list.Add(new ActionSearchSortRule(sortText));
                }

                continue;
            }

            if (item.ValueKind != JsonValueKind.Object)
            {
                error = "Each sort.by item must be a string or {key|script,desc} object.";
                return false;
            }

            if (!TryParseSortRule(item, rootForDescFallback: null, out var singleRule, out error))
            {
                return false;
            }

            if (singleRule.Count == 0)
            {
                continue;
            }

            list.Add(singleRule[0]);
        }

        rules = list;
        return true;
    }

    private static bool TryParseSortRule(
        JsonElement element,
        JsonElement? rootForDescFallback,
        out IReadOnlyList<ActionSearchSortRule> rules,
        out string? error)
    {
        rules = Array.Empty<ActionSearchSortRule>();
        error = null;

        var script = ReadSortKeyFromElement(element);
        if (string.IsNullOrWhiteSpace(script))
        {
            error = "sort object requires key, script, expr, or by.";
            return false;
        }

        script = script.Trim();
        if (ActionSearchSortShorthand.TryParse(script, out var shorthandRule))
        {
            var descendingOverride = ReadOptionalBool(element, "desc", "sortDesc", "descending")
                ?? (rootForDescFallback is { } root
                    ? ReadOptionalBool(root, "desc", "sortDesc", "descending")
                    : null);
            rules = new[]
            {
                descendingOverride is bool overrideDescending
                    ? new ActionSearchSortRule(shorthandRule.Script, overrideDescending)
                    : shorthandRule,
            };
            return true;
        }

        var descending = ReadOptionalBool(element, "desc", "sortDesc", "descending")
            ?? (rootForDescFallback is { } rootFallback
                ? ReadOptionalBool(rootFallback, "desc", "sortDesc", "descending")
                : null)
            ?? false;
        rules = new[] { new ActionSearchSortRule(script, descending) };
        return true;
    }

    private static bool TryReadSourceFilter(JsonElement root, out ActionSourceFilter filter)
    {
        filter = default;
        var source = ReadOptionalString(root, "source", "filterSource");
        if (string.IsNullOrWhiteSpace(source))
        {
            return false;
        }

        var sharedId = ReadOptionalString(root, "sharedId", "sharedActionId", "templateId");
        switch (source.Trim().ToLowerInvariant())
        {
            case "library":
            case "installed":
                filter = new ActionSourceFilter(ActionSourceFilterKind.Library);
                return true;
            case "local":
                filter = new ActionSourceFilter(ActionSourceFilterKind.Local);
                return true;
            case "published":
            case "shared":
                filter = new ActionSourceFilter(ActionSourceFilterKind.Published);
                return true;
            case "sharedid":
            case "id":
                if (string.IsNullOrWhiteSpace(sharedId))
                {
                    return false;
                }

                filter = new ActionSourceFilter(ActionSourceFilterKind.SharedId, sharedId.Trim());
                return true;
            default:
                return false;
        }
    }

    private static bool TryReadSubProgramSearch(JsonElement root, out SubProgramReferenceSearch search)
    {
        search = default;
        var uses = ReadOptionalString(root, "uses", "ref", "subProgram");
        if (string.IsNullOrWhiteSpace(uses))
        {
            return false;
        }

        var dedicatedOnly = ReadOptionalBool(root, "usesOnly", "uses-only", "dedicatedOnly", "refOnly") ?? false;
        search = new SubProgramReferenceSearch(uses.Trim(), dedicatedOnly);
        return true;
    }

    private static string? ReadSortKeyFromElement(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String)
        {
            return value.GetString();
        }

        if (value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var name in new[] { "key", "script", "expr" })
        {
            if (value.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String)
            {
                return prop.GetString();
            }
        }

        return null;
    }

    private static string? ReadOptionalString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
            {
                var text = value.GetString();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text.Trim();
                }
            }
        }

        return null;
    }

    private static bool? ReadOptionalBool(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value))
            {
                continue;
            }

            switch (value.ValueKind)
            {
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                case JsonValueKind.String when bool.TryParse(value.GetString(), out var parsed):
                    return parsed;
            }
        }

        return null;
    }

    private static bool TryReadFields(
        JsonElement root,
        out IReadOnlyList<string> fields,
        out string? error)
    {
        fields = Array.Empty<string>();
        error = null;

        JsonElement? fieldsElement = null;
        foreach (var name in new[] { "fields", "select", "columns" })
        {
            if (root.TryGetProperty(name, out var value))
            {
                fieldsElement = value;
                break;
            }
        }

        if (fieldsElement is null)
        {
            return true;
        }

        var parsed = new List<string>();
        switch (fieldsElement.Value.ValueKind)
        {
            case JsonValueKind.String:
            {
                var csv = fieldsElement.Value.GetString();
                if (string.IsNullOrWhiteSpace(csv))
                {
                    return true;
                }

                parsed.AddRange(
                    csv.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(part => part.Trim())
                        .Where(part => part.Length > 0));
                break;
            }
            case JsonValueKind.Array:
                foreach (var item in fieldsElement.Value.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.String)
                    {
                        error = "fields must be a string array, comma-separated string, or \"*\".";
                        return false;
                    }

                    var text = item.GetString();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        parsed.Add(text.Trim());
                    }
                }

                break;
            default:
                error = "fields must be a string array, comma-separated string, or \"*\".";
                return false;
        }

        if (!ActionSummaryFieldCatalog.TryNormalize(parsed, out var normalized, out error))
        {
            return false;
        }

        fields = normalized;
        return true;
    }
}
