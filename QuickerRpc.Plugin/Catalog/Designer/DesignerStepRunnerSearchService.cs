using System.Collections.Generic;
using Newtonsoft.Json;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>Action-editor quick insert and toolbox search (UI only).</summary>
internal sealed class DesignerStepRunnerSearchService
{
    private readonly object _toolboxLock = new();
    private int _cachedToolboxGeneration = -1;
    private List<StepQuickInsertCatalog.CatalogRow>? _cachedToolboxRows;

    public QuickerRpcDesignerSearchPageResult SearchQuickInsert(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms)
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return Fail("Not running inside Quicker.");
        }

        try
        {
            var catalog = StepRunnerUiCatalogBuilder.Build();
            var body = JsonConvert.SerializeObject(
                new
                {
                    keyword = keyword ?? string.Empty,
                    skip,
                    subPrograms = MapSubPrograms(subPrograms),
                });
            var json = DesignerStepRunnerSearchHttp.FormatQuickInsertSearch(body, catalog);
            return Ok(json);
        }
        catch (System.Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    public QuickerRpcDesignerSearchPageResult SearchToolbox(string? keyword, int skip)
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return Fail("Not running inside Quicker.");
        }

        try
        {
            var toolboxRows = GetOrBuildToolboxRows();
            var body = JsonConvert.SerializeObject(new { keyword = keyword ?? string.Empty, skip });
            var json = DesignerStepRunnerSearchHttp.FormatToolboxSearch(body, toolboxRows);
            return Ok(json);
        }
        catch (System.Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    private static IList<object>? MapSubPrograms(IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms)
    {
        if (subPrograms is null || subPrograms.Count == 0)
        {
            return null;
        }

        var list = new List<object>();
        foreach (var sp in subPrograms)
        {
            var ident = (sp.Identifier ?? string.Empty).Trim();
            if (ident.Length == 0)
            {
                continue;
            }

            list.Add(
                new
                {
                    id = sp.Id ?? string.Empty,
                    name = sp.Name ?? string.Empty,
                    description = sp.Description ?? string.Empty,
                    identifier = ident,
                });
        }

        return list.Count > 0 ? list : null;
    }

    private List<StepQuickInsertCatalog.CatalogRow> GetOrBuildToolboxRows()
    {
        lock (_toolboxLock)
        {
            var gen = StepRunnerCatalogGeneration.Current;
            if (_cachedToolboxRows is not null && _cachedToolboxGeneration == gen)
            {
                return _cachedToolboxRows;
            }

            var catalog = StepRunnerUiCatalogBuilder.Build();
            _cachedToolboxRows = ToolboxSearchCatalog.BuildRows(catalog);
            _cachedToolboxGeneration = gen;
            return _cachedToolboxRows;
        }
    }

    private static QuickerRpcDesignerSearchPageResult Ok(string json) =>
        new()
        {
            Success = true,
            Json = json,
        };

    private static QuickerRpcDesignerSearchPageResult Fail(string message) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
        };
}
