using System;
using System.Collections.Generic;
using System.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Maps <see cref="StepRunnerCatalog"/> to agent-facing step-runner search and schema DTOs.</summary>
public static class StepRunnerCatalogMapper
{
    public static SearchStepRunnersResult Search(StepRunnerCatalog catalog, string keyword, int? maxResults)
    {
        var limit = maxResults is > 0 ? Math.Min(maxResults!.Value, 200) : 40;
        var kw = (keyword ?? string.Empty).Trim();
        if (StepRunnerSearchQuery.IsBareWildcardQuery(kw))
        {
            kw = string.Empty;
        }

        var searchQuery = StepRunnerSearchQuery.Parse(kw);
        if (searchQuery.IsEmpty)
        {
            return SearchBrowse(catalog, limit);
        }

        IEnumerable<StepRunnerDefinition> query = catalog.Items
            .Where(r => !StepRunnerAgentSearchFilter.IsModuleExcludedFromSearch(r))
            .Where(r => StepRunnerSearchQuery.RowMatches(r, searchQuery));

        var ordered = query
            .Select(r => (r, rank: StepRunnerKeywordSearch.ComputeRank(r, searchQuery)))
            .OrderByDescending(x => x.rank.TotalScore)
            .ThenByDescending(x => x.rank.ControlScore)
            .ThenBy(x => x.r.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => ToSearchItem(x.r, x.rank, includeControlField: true))
            .ToList();

        return new SearchStepRunnersResult
        {
            Success = true,
            Keyword = kw,
            MatchCount = ordered.Count,
            Items = ordered
        };
    }

    /// <summary>Full catalog listing for maintainers and UI hydration (not agent keyword search).</summary>
    public static SearchStepRunnersResult ListCatalog(StepRunnerCatalog catalog, int? maxResults)
    {
        const int listLimitMax = 500;
        var limit = maxResults is > 0 ? Math.Min(maxResults!.Value, listLimitMax) : listLimitMax;

        var items = catalog.Items
            .Where(r => !StepRunnerAgentSearchFilter.IsModuleExcludedFromSearch(r))
            .OrderBy(r => r.Key ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(r => ToSearchItem(r, new StepRunnerSearchRankResult(), includeControlField: false))
            .ToList();

        return new SearchStepRunnersResult
        {
            Success = true,
            MatchCount = items.Count,
            Items = items,
        };
    }

    private static SearchStepRunnersResult SearchBrowse(StepRunnerCatalog catalog, int limit)
    {
        var byKey = catalog.Items
            .Where(r => !StepRunnerAgentSearchFilter.IsModuleExcludedFromSearch(r))
            .Where(r => StepRunnerBrowseCatalog.Contains(r.Key ?? string.Empty))
            .ToDictionary(r => r.Key ?? string.Empty, r => r, StringComparer.OrdinalIgnoreCase);

        var ordered = new List<StepRunnerSearchItem>();
        foreach (var key in StepRunnerBrowseCatalog.OrderedKeys)
        {
            if (!byKey.TryGetValue(key, out var row))
            {
                continue;
            }

            ordered.Add(ToSearchItem(row, new StepRunnerSearchRankResult(), includeControlField: false));
            if (ordered.Count >= limit)
            {
                break;
            }
        }

        return new SearchStepRunnersResult
        {
            Success = true,
            Keyword = null,
            MatchCount = ordered.Count,
            Items = ordered,
        };
    }

    public static StepRunnerDetailResult GetDetail(
        StepRunnerCatalog catalog,
        string stepRunnerKey,
        string? controlFieldValue = null)
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
            return new StepRunnerDetailResult
            {
                Success = true,
                Schema = MapAgentSchema(item, controlFieldValue)
            };
        }
        catch (Exception ex)
        {
            return new StepRunnerDetailResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private static StepRunnerSearchItem ToSearchItem(
        StepRunnerDefinition row,
        StepRunnerSearchRankResult rank,
        bool includeControlField)
    {
        var retrieval = StepRunnerRetrievalBuilder.Build(row);
        var item = new StepRunnerSearchItem
        {
            Key = row.Key ?? string.Empty,
            Name = row.Name ?? string.Empty,
            Description = TrimToNull(row.Description),
            Snippet = retrieval.Snippet,
            Icon = TrimToNull(row.Icon),
        };

        if (StepRunnerModuleDocRefCatalog.TryGet(row.Key ?? string.Empty, out var docRef))
        {
            item.DocReference = docRef;
        }

        if (includeControlField)
        {
            if (rank.MatchedControls.Count > 1)
            {
                item.ControlFields = rank.MatchedControls;
                item.ControlField = rank.MatchedControls[0];
            }
            else
            {
                var control = ResolveSearchControlField(row, rank);
                if (control is not null)
                {
                    item.ControlField = control;
                }
            }
        }

        return item;
    }

    /// <summary>
    /// Best-matching control selection for search hits (keyword ranking, else catalog default).
    /// </summary>
    private static StepRunnerControlFieldMatch? ResolveSearchControlField(
        StepRunnerDefinition row,
        StepRunnerSearchRankResult rank)
    {
        if (rank.Control is not null)
        {
            return rank.Control;
        }

        return DefaultControlFieldMatch(row);
    }

    private static StepRunnerControlFieldMatch? DefaultControlFieldMatch(StepRunnerDefinition row)
    {
        var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
        if (control is null || control.SelectionItems.Count == 0)
        {
            return null;
        }

        var controlKey = control.Key ?? string.Empty;
        var moduleDoc = StepRunnerRetrievalBuilder.BuildModuleOnly(row);
        StepRunnerParamSelectionItem? best = null;
        var bestBias = int.MinValue;

        var moduleKey = row.Key ?? string.Empty;
        foreach (var si in control.SelectionItems)
        {
            var value = (si.Value ?? string.Empty).Trim();
            if (value.Length == 0
                || StepRunnerAgentSearchFilter.IsControlValueExcludedFromSearch(moduleKey, value))
            {
                continue;
            }

            var bias = moduleDoc.ControlRankBias.TryGetValue(value, out var b) ? b : 0;
            if (best is null || bias > bestBias)
            {
                bestBias = bias;
                best = si;
            }
        }

        best ??= control.SelectionItems.FirstOrDefault(si =>
            (si.Value ?? string.Empty).Trim().Length > 0
            || (si.Name ?? string.Empty).Trim().Length > 0);
        if (best is null)
        {
            return null;
        }

        var resolvedValue = (best.Value ?? string.Empty).Trim();
        if (resolvedValue.Length == 0)
        {
            return null;
        }

        return new StepRunnerControlFieldMatch
        {
            Key = controlKey,
            Value = resolvedValue,
            Name = TrimToNull(best.Name) ?? string.Empty,
        };
    }

    private static StepRunnerAgentSchema MapAgentSchema(
        StepRunnerDefinition runner,
        string? controlFieldValue)
    {
        var control = StepRunnerInputParamVisibility.TryFindControlField(runner.InputParamDefs);
        var appliedValue = (controlFieldValue ?? string.Empty).Trim();
        var hasControl = control is not null;
        var filteringAvailable = StepRunnerInputParamVisibility.RunnerHasVisibilityRules(runner);

        if (hasControl && appliedValue.Length > 0
            && !StepRunnerInputParamVisibility.IsValidControlValue(control!, appliedValue))
        {
            throw new InvalidOperationException(
                "Invalid control field value '"
                + appliedValue
                + "' for "
                + (runner.Key ?? string.Empty)
                + ". Valid values: "
                + StepRunnerInputParamVisibility.FormatValidControlValues(control!));
        }

        var dto = new StepRunnerAgentSchema
        {
            StepRunnerKey = runner.Key ?? string.Empty,
            Name = runner.Name ?? string.Empty,
            Description = TrimToNull(runner.Description),
            Icon = TrimToNull(runner.Icon),
            ControlField = MapControlFieldOrNull(runner),
            VisibilityFilteringAvailable = filteringAvailable
        };

        if (hasControl && appliedValue.Length > 0)
        {
            dto.AppliedControlFieldKey = control!.Key;
            dto.AppliedControlFieldValue = appliedValue;
        }
        else if (hasControl)
        {
            dto.AgentGuidance =
                "Pass --control-field <value> (values: "
                + StepRunnerInputParamVisibility.FormatValidControlValues(control!)
                + ") to filter inputs/outputs. Each controlField.selection[] entry includes visibleInputKeys and visibleOutputKeys for that mode.";
        }

        if (StepRunnerModuleDocRefCatalog.TryGet(runner.Key ?? string.Empty, out var docRef))
        {
            dto.DocReference = docRef;
        }

        if (hasControl && appliedValue.Length > 0 && !filteringAvailable)
        {
            dto.AgentGuidance =
                "Input visibility rules unavailable; returning all inputs. Prefer control-field from search.";
        }

        var controlKey = control?.Key;
        var filterByControl = hasControl && appliedValue.Length > 0 && filteringAvailable;

        foreach (var p in runner.InputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(p.Key))
            {
                continue;
            }

            if (filterByControl
                && !StepRunnerInputParamVisibility.IsInputVisible(p, controlKey, appliedValue))
            {
                continue;
            }

            dto.Inputs.Add(MapInput(runner.Key ?? string.Empty, p, controlKey, appliedValue));
        }

        foreach (var p in runner.OutputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(p.Key))
            {
                continue;
            }

            if (filterByControl
                && !StepRunnerInputParamVisibility.IsOutputVisible(p, controlKey, appliedValue))
            {
                continue;
            }

            dto.Outputs.Add(MapOutput(p));
        }

        return dto;
    }

    private static ControlFieldSchema? MapControlFieldOrNull(StepRunnerDefinition runner)
    {
        var inputDefs = runner.InputParamDefs;
        var control = StepRunnerInputParamVisibility.TryFindControlField(inputDefs);
        if (control is null)
        {
            return null;
        }

        var controlKey = control.Key ?? string.Empty;
        var dto = new ControlFieldSchema
        {
            Key = controlKey,
            Title = TrimToNull(control.Name),
            Purpose = TrimToNull(control.Description),
        };
        foreach (var si in control.SelectionItems)
        {
            var value = (si.Value ?? string.Empty).Trim();
            if (value.Length == 0)
            {
                continue;
            }

            dto.Selection.Add(
                new ControlFieldSelection
                {
                    Key = value,
                    Name = si.Name ?? string.Empty,
                    VisibleInputKeys = StepRunnerInputParamVisibility.ResolveVisibleInputKeys(
                        inputDefs,
                        controlKey,
                        value),
                    VisibleOutputKeys = StepRunnerInputParamVisibility.ResolveVisibleOutputKeys(
                        runner.OutputParamDefs,
                        controlKey,
                        value),
                });
        }

        return dto.Selection.Count > 0 ? dto : null;
    }

    private static AgentInputParamSchema MapInput(
        string stepRunnerKey,
        StepRunnerInputParamDef p,
        string? controlFieldKey,
        string controlFieldValue)
    {
        var dto = new AgentInputParamSchema
        {
            Key = p.Key ?? string.Empty,
            Title = TrimToNull(p.Name),
            Purpose = TrimToNull(p.Description),
            IsControlField = p.IsControlField,
            ValueType = VarTypeNames.Format(p.VarType),
            Required = p.IsRequired,
            VariableMode = p.VariableMode,
            IsMultiLine = p.IsMultiLine,
            IsAdvanced = p.IsAdvanced,
            AllowInput = p.AllowInput,
            TextTools = TrimToNull(p.TextTools),
            FileExt = StepRunnerResourceFileExtensions.TryGetAgentFileExtensionHint(
                stepRunnerKey,
                p.Key ?? string.Empty,
                p.IsMultiLine,
                p.IsControlField,
                controlFieldKey,
                controlFieldValue),
        };

        dto.Default = StepRunnerAgentDefaultValue.FormatForAgent(p.VarType, p.DefaultValue);

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
            Title = TrimToNull(p.Name),
            Purpose = TrimToNull(p.Description),
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
                Name = TrimToNull(si.Name),
            };
            var hint = TrimToNull(si.Description);
            if (hint is not null)
            {
                o.Hint = hint;
            }

            list.Add(o);
        }

        return list.Count > 0 ? list : null;
    }

    private static string? TrimToNull(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }
}
