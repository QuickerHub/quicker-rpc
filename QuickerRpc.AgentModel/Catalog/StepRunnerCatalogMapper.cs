using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Maps <see cref="StepRunnerCatalog"/> to agent-facing step-runner search and schema DTOs.</summary>
public static class StepRunnerCatalogMapper
{
    public static SearchStepRunnersResult Search(StepRunnerCatalog catalog, string keyword, int? maxResults)
    {
        var limit = maxResults is > 0 and <= 200 ? maxResults!.Value : 40;
        var kw = (keyword ?? string.Empty).Trim();
        var searchQuery = StepRunnerSearchQuery.Parse(kw);

        IEnumerable<StepRunnerDefinition> query = catalog.Items;
        if (kw.Length > 0)
        {
            query = query.Where(r => StepRunnerSearchQuery.RowMatches(r, searchQuery));
        }

        var ordered = query
            .Select(r => (r, score: StepRunnerSearchQuery.ComputeSortScore(r, searchQuery)))
            .OrderByDescending(x => x.score)
            .ThenBy(x => x.r.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => ToSearchItem(x.r))
            .ToList();

        return new SearchStepRunnersResult
        {
            Success = true,
            Keyword = kw.Length == 0 ? null : kw,
            MatchCount = ordered.Count,
            Items = ordered
        };
    }

    public static StepRunnerDetailResult GetDetail(StepRunnerCatalog catalog, string stepRunnerKey)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(key))
        {
            return new StepRunnerDetailResult { Success = false, ErrorMessage = "StepRunnerKey is required" };
        }

        var item = catalog.TryFind(key);
        if (item is null)
        {
            return new StepRunnerDetailResult
            {
                Success = false,
                ErrorMessage = "No StepRunner with key " + key
            };
        }

        try
        {
            return new StepRunnerDetailResult { Success = true, Schema = MapAgentSchema(item) };
        }
        catch (Exception ex)
        {
            return new StepRunnerDetailResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private static StepRunnerSearchItem ToSearchItem(StepRunnerDefinition row) =>
        new()
        {
            Key = row.Key ?? string.Empty,
            Name = row.Name ?? string.Empty,
            Description = row.Description ?? string.Empty
        };

    private static StepRunnerAgentSchema MapAgentSchema(StepRunnerDefinition runner)
    {
        var dto = new StepRunnerAgentSchema
        {
            StepRunnerKey = runner.Key ?? string.Empty,
            Name = runner.Name ?? string.Empty,
            Description = runner.Description ?? string.Empty,
            ControlField = MapControlFieldOrNull(runner.InputParamDefs)
        };

        foreach (var p in runner.InputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(p.Key))
            {
                continue;
            }

            dto.Inputs.Add(MapInput(p));
        }

        foreach (var p in runner.OutputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(p.Key))
            {
                continue;
            }

            dto.Outputs.Add(MapOutput(p));
        }

        return dto;
    }

    private static ControlFieldSchema? MapControlFieldOrNull(IList<StepRunnerInputParamDef> inputDefs)
    {
        StepRunnerInputParamDef? control = null;
        foreach (var p in inputDefs)
        {
            if (p.IsControlField && p.VarType == 9 && p.SelectionItems.Count > 0)
            {
                control = p;
                break;
            }
        }

        if (control is null)
        {
            return null;
        }

        var dto = new ControlFieldSchema
        {
            Key = control.Key ?? string.Empty,
            Title = control.Name ?? string.Empty,
            Purpose = control.Description ?? string.Empty
        };
        foreach (var si in control.SelectionItems)
        {
            dto.Selection.Add(
                new ControlFieldSelection
                {
                    Key = si.Value ?? string.Empty,
                    Name = si.Name ?? string.Empty
                });
        }

        return dto.Selection.Count > 0 ? dto : null;
    }

    private static AgentInputParamSchema MapInput(StepRunnerInputParamDef p)
    {
        var dto = new AgentInputParamSchema
        {
            Key = p.Key ?? string.Empty,
            Title = p.Name ?? string.Empty,
            Purpose = p.Description ?? string.Empty,
            IsControlField = p.IsControlField,
            ValueType = VarTypeNames.Format(p.VarType),
            Required = p.IsRequired
        };

        var def = (p.DefaultValue ?? string.Empty).Trim();
        if (def.Length > 0)
        {
            dto.Default = def;
        }

        if (p.VarType == 9 && p.HasInternalType)
        {
            dto.InternalValueType = VarTypeNames.Format(p.InternalType);
        }

        var options = BuildOptions(p.SelectionItems);
        if (options is not null)
        {
            dto.Options = options;
        }

        return dto;
    }

    private static AgentOutputParamSchema MapOutput(StepRunnerOutputParamDef p)
    {
        var dto = new AgentOutputParamSchema
        {
            Key = p.Key ?? string.Empty,
            Title = p.Name ?? string.Empty,
            Purpose = p.Description ?? string.Empty,
            ValueType = VarTypeNames.Format(p.VarType)
        };

        var ctn = (p.CustomTypeName ?? string.Empty).Trim();
        if (ctn.Length > 0)
        {
            dto.CustomTypeName = ctn;
        }

        return dto;
    }

    private static List<AgentParamOption>? BuildOptions(IList<StepRunnerParamSelectionItem> items)
    {
        if (items is null || items.Count == 0)
        {
            return null;
        }

        var list = new List<AgentParamOption>();
        foreach (var si in items)
        {
            var o = new AgentParamOption
            {
                Key = si.Value ?? string.Empty,
                Name = si.Name ?? string.Empty
            };
            var hint = (si.Description ?? string.Empty).Trim();
            if (hint.Length > 0)
            {
                o.Hint = hint;
            }

            list.Add(o);
        }

        return list.Count > 0 ? list : null;
    }
}
