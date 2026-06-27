using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>
/// Step-runner quick-insert and toolbox search JSON, aligned with
/// <c>Quicker.ActionDesigner.Backend.Controllers.StepQuickInsertSearchController</c> and
/// <c>ToolboxSearchController</c>; input catalog comes from the host snapshot (RPC) instead of
/// <c>Quicker.Domain.Actions.X.StepRunners.IStepRunnerService</c>).
/// </summary>
internal static class DesignerStepRunnerSearchHttp
{
    private static readonly JsonSerializerSettings CamelCaseJson = new JsonSerializerSettings
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore
    };

    /// <summary>Same body/response contract as Backend POST <c>/api/step-quick-insert/search</c>.</summary>
    public static string FormatQuickInsertSearch(string requestBodyJson, DesignerStepRunnerUiCatalog runnersResponse)
    {
        string keyword;
        int skip;
        List<StepQuickInsertCatalog.SubProgramInput>? subPrograms;
        try
        {
            var body = string.IsNullOrWhiteSpace(requestBodyJson) ? new JObject() : JObject.Parse(requestBodyJson);
            keyword = body.Value<string>("keyword") ?? "";
            skip = ParseSkip(body["skip"]);
            subPrograms = ParseSubPrograms(body["subPrograms"] as JArray);
        }
        catch (JsonException)
        {
            return DesignerJsonPayloads.EmptySearchPage;
        }

        var rows = StepQuickInsertCatalog.BuildRows(runnersResponse, subPrograms);
        var patterns = StepQuickInsertCatalog.SplitKeywordPatterns(keyword);

        List<StepQuickInsertCatalog.CatalogRow> ordered;
        if (patterns.Length == 0)
        {
            ordered = rows;
        }
        else
        {
            ordered = rows
                .Where(r => StepQuickInsertCatalog.RowMatches(r, patterns))
                .Select(r => (r, k: StepQuickInsertCatalog.ComputeSortKey(r, patterns)))
                .OrderBy(x => StepQuickInsertCatalog.QuickInsertSortRankTier(x.r))
                .ThenByDescending(x => x.k)
                .ThenBy(x => x.r.Id, StringComparer.Ordinal)
                .Select(x => x.r)
                .ToList();
        }

        var totalCount = ordered.Count;
        var page = ordered.Skip(skip).Take(StepQuickInsertCatalog.PageSize).ToList();
        var hasMore = skip + page.Count < totalCount;

        var items = page.Select(r => StepQuickInsertCatalog.ToJsonItem(r, patterns)).ToList();
        var payload = new { items, totalCount, hasMore };
        return JsonConvert.SerializeObject(payload, CamelCaseJson);
    }

    /// <summary>Same body/response contract as Backend POST <c>/api/toolbox/search</c>.</summary>
    public static string FormatToolboxSearch(string requestBodyJson, IReadOnlyList<StepQuickInsertCatalog.CatalogRow> toolboxRows)
    {
        string keyword;
        int skip;
        try
        {
            var body = string.IsNullOrWhiteSpace(requestBodyJson) ? new JObject() : JObject.Parse(requestBodyJson);
            keyword = body.Value<string>("keyword") ?? "";
            skip = ParseSkip(body["skip"]);
        }
        catch (JsonException)
        {
            return DesignerJsonPayloads.EmptySearchPage;
        }

        var rows = toolboxRows.ToList();
        var patterns = StepQuickInsertCatalog.SplitKeywordPatterns(keyword);

        List<StepQuickInsertCatalog.CatalogRow> ordered;
        if (patterns.Length == 0)
        {
            ordered = rows;
        }
        else
        {
            ordered = rows
                .Where(r => StepQuickInsertCatalog.RowMatches(r, patterns))
                .Select(r => (r, k: StepQuickInsertCatalog.ComputeSortKey(r, patterns)))
                .OrderBy(x => ToolboxSortRankTier(x.r))
                .ThenByDescending(x => x.k)
                .ThenBy(x => x.r.Id, StringComparer.Ordinal)
                .Select(x => x.r)
                .ToList();
        }

        var totalCount = ordered.Count;
        var page = ordered.Skip(skip).Take(StepQuickInsertCatalog.PageSize).ToList();
        var hasMore = skip + page.Count < totalCount;

        var items = page.Select(r => StepQuickInsertCatalog.ToJsonItem(r, patterns)).ToList();
        var payload = new { items, totalCount, hasMore };
        return JsonConvert.SerializeObject(payload, CamelCaseJson);
    }

    private static int ParseSkip(JToken? skipRaw)
    {
        var skip = 0;
        if (skipRaw == null || skipRaw.Type == JTokenType.Null)
        {
            return skip;
        }

        if (skipRaw.Type == JTokenType.Integer)
        {
            skip = skipRaw.Value<int>();
        }
        else if (int.TryParse(skipRaw.ToString(), out var parsed))
        {
            skip = parsed;
        }

        return skip < 0 ? 0 : skip;
    }

    private static List<StepQuickInsertCatalog.SubProgramInput>? ParseSubPrograms(JArray? arr)
    {
        if (arr == null || arr.Count == 0)
        {
            return null;
        }

        var list = new List<StepQuickInsertCatalog.SubProgramInput>();
        foreach (var token in arr)
        {
            if (token is not JObject o)
            {
                continue;
            }

            var ident = o.Value<string>("identifier") ?? o.Value<string>("subProgramIdentifier") ?? "";
            if (string.IsNullOrWhiteSpace(ident))
            {
                continue;
            }

            list.Add(
                new StepQuickInsertCatalog.SubProgramInput
                {
                    Id = o.Value<string>("id") ?? "",
                    Name = o.Value<string>("name") ?? "",
                    Description = o.Value<string>("description") ?? "",
                    Identifier = ident.Trim()
                });
        }

        return list.Count > 0 ? list : null;
    }

    private static bool IsToolboxModuleParentRow(StepQuickInsertCatalog.CatalogRow r)
    {
        if (!string.Equals(r.Kind, "runner", StringComparison.Ordinal) || r.Payload == null)
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(r.Payload.ControlFieldValue))
        {
            return false;
        }

        var id = r.Id ?? "";
        if (!id.StartsWith("r:", StringComparison.Ordinal))
        {
            return false;
        }

        var rest = id.Length >= 2 ? id.Substring(2) : "";
        var pk = (r.Payload.StepRunnerKey ?? "").Trim();
        return rest.Length > 0 && string.Equals(rest, pk, StringComparison.Ordinal);
    }

    private static int ToolboxSortRankTier(StepQuickInsertCatalog.CatalogRow r)
    {
        if (!string.Equals(r.Kind, "runner", StringComparison.Ordinal) || r.Payload == null)
        {
            return 2;
        }

        if (!string.IsNullOrWhiteSpace(r.Payload.ControlFieldValue))
        {
            return 2;
        }

        return IsToolboxModuleParentRow(r) ? 0 : 1;
    }
}
