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

        var ordered = RankSearchMatches(catalog, searchQuery, limit);
        if (ordered.Count == 0 && StepRunnerSearchQuery.CanTryOrTokenFallback(kw, searchQuery))
        {
            ordered = RankBestSingleTokenSearch(catalog, kw, limit);
        }

        if (ordered.Count == 0)
        {
            ordered = RankBestTokenRescue(catalog, kw, limit);
        }

        return new SearchStepRunnersResult
        {
            Success = true,
            Keyword = kw,
            MatchCount = ordered.Count,
            Items = ordered
        };
    }

    private static List<StepRunnerSearchItem> RankSearchMatches(
        StepRunnerCatalog catalog,
        StepRunnerSearchQuery searchQuery,
        int limit)
    {
        return catalog.Items
            .Where(r => !StepRunnerAgentSearchFilter.IsModuleExcludedFromSearch(r))
            .Where(r => StepRunnerSearchQuery.RowMatches(r, searchQuery))
            .Select(r => (r, rank: StepRunnerKeywordSearch.ComputeRank(r, searchQuery)))
            .OrderByDescending(x => x.rank.TotalScore)
            .ThenByDescending(x => x.rank.ControlScore)
            .ThenBy(x => x.r.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => ToSearchItem(x.r, x.rank, includeControlField: true))
            .ToList();
    }

    /// <summary>
    /// When AND returns nothing, pick the token whose single-token search ranks best
    /// (avoids full OR union noise for queries like "clipboard read").
    /// </summary>
    private static List<StepRunnerSearchItem> RankBestSingleTokenSearch(
        StepRunnerCatalog catalog,
        string keyword,
        int limit)
    {
        var tokens = keyword
            .Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .Where(t => t.Length > 0)
            .ToArray();
        if (tokens.Length == 0)
        {
            return new List<StepRunnerSearchItem>();
        }

        List<StepRunnerSearchItem>? bestItems = null;
        var bestScore = int.MinValue;

        foreach (var rawToken in tokens)
        {
            var tokenQuery = StepRunnerSearchQuery.Parse(rawToken);
            if (tokenQuery.IsEmpty)
            {
                continue;
            }

            var ranked = catalog.Items
                .Where(r => !StepRunnerAgentSearchFilter.IsModuleExcludedFromSearch(r))
                .Where(r => StepRunnerSearchQuery.RowMatches(r, tokenQuery))
                .Select(r => (r, rank: StepRunnerKeywordSearch.ComputeRank(r, tokenQuery)))
                .OrderByDescending(x => x.rank.TotalScore)
                .ThenByDescending(x => x.rank.ControlScore)
                .ThenBy(x => x.r.Name, StringComparer.OrdinalIgnoreCase)
                .Take(limit)
                .ToList();

            if (ranked.Count == 0)
            {
                continue;
            }

            var topScore = ranked[0].rank.TotalScore;
            var pickScore = topScore - (int)(Math.Log(ranked.Count + 1) * 2);
            if (pickScore > bestScore)
            {
                bestScore = pickScore;
                bestItems = ranked
                    .Select(x => ToSearchItem(x.r, x.rank, includeControlField: true))
                    .ToList();
            }
        }

        return bestItems ?? new List<StepRunnerSearchItem>();
    }

    /// <summary>
    /// Last resort when primary parse returns nothing: wildcard-wrap tokens and identifier parts.
    /// </summary>
    private static List<StepRunnerSearchItem> RankBestTokenRescue(
        StepRunnerCatalog catalog,
        string keyword,
        int limit)
    {
        var rescueQueries = BuildRescueQueries(keyword);
        if (rescueQueries.Count == 0)
        {
            return new List<StepRunnerSearchItem>();
        }

        var ranked = new List<(StepRunnerSearchItem item, int score)>();
        foreach (var query in rescueQueries)
        {
            foreach (var row in catalog.Items.Where(r => !StepRunnerAgentSearchFilter.IsModuleExcludedFromSearch(r)))
            {
                if (!StepRunnerSearchQuery.RowMatches(row, query))
                {
                    continue;
                }

                var rank = StepRunnerKeywordSearch.ComputeRank(row, query);
                ranked.Add((ToSearchItem(row, rank, includeControlField: true), rank.TotalScore));
            }
        }

        return ranked
            .GroupBy(x => x.item.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.OrderByDescending(x => x.score).First())
            .OrderByDescending(x => x.score)
            .ThenBy(x => x.item.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => x.item)
            .ToList();
    }

    private static List<StepRunnerSearchQuery> BuildRescueQueries(string keyword)
    {
        var queries = new List<StepRunnerSearchQuery>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void TryAdd(string? token)
        {
            var t = (token ?? string.Empty).Trim();
            if (t.Length < 3 || !seen.Add(t))
            {
                return;
            }

            if (t.IndexOf('*') < 0)
            {
                queries.Add(StepRunnerSearchQuery.Parse("*" + t + "*"));
            }

            queries.Add(StepRunnerSearchQuery.Parse(t));
        }

        foreach (var rawToken in keyword
                     .Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries)
                     .Select(t => t.Trim())
                     .Where(t => t.Length > 0))
        {
            TryAdd(rawToken);
            foreach (var part in SplitIdentifierParts(rawToken))
            {
                TryAdd(part);
            }
        }

        return queries;
    }

    private static IEnumerable<string> SplitIdentifierParts(string token)
    {
        if (token.Length == 0)
        {
            yield break;
        }

        var start = 0;
        for (var i = 1; i < token.Length; i++)
        {
            var prev = token[i - 1];
            var cur = token[i];
            if (char.IsUpper(cur) && (char.IsLower(prev) || char.IsDigit(prev)))
            {
                yield return token.Substring(start, i - start);
                start = i;
            }
        }

        if (start < token.Length)
        {
            yield return token.Substring(start);
        }
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
                item.ControlFields = rank.MatchedControls
                    .Select(m => EnrichControlFieldMatch(row, m, m.Key, m.Value))
                    .ToList();
                item.ControlField = item.ControlFields[0];
            }
            else if (rank.ControlScore > 0 && rank.Control is not null)
            {
                item.ControlField = EnrichControlFieldMatch(
                    row,
                    rank.Control,
                    rank.Control.Key,
                    rank.Control.Value);
            }
            else
            {
                var allControls = ListAllSearchableControlFields(row);
                if (allControls.Count > 1)
                {
                    item.ControlFields = allControls;
                }
                else if (allControls.Count == 1)
                {
                    item.ControlField = allControls[0];
                }
            }
        }

        AttachSearchItemParamKeyHints(row, item);
        return item;
    }

    private static StepRunnerControlFieldMatch EnrichControlFieldMatch(
        StepRunnerDefinition row,
        StepRunnerControlFieldMatch match,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        var inputKeys = CollectVisibleInputKeys(row, controlFieldKey, controlFieldValue);
        var outputKeys = CollectVisibleOutputKeys(row, controlFieldKey, controlFieldValue);
        if (inputKeys.Count > 0)
        {
            match.VisibleInputKeys = inputKeys;
        }

        if (outputKeys.Count > 0)
        {
            match.VisibleOutputKeys = outputKeys;
        }

        return match;
    }

    private static void AttachSearchItemParamKeyHints(
        StepRunnerDefinition row,
        StepRunnerSearchItem item)
    {
        var control = item.ControlField;
        var controlKey = control?.Key;
        var controlValue = control?.Value;
        var inputKeys = control?.VisibleInputKeys ?? CollectVisibleInputKeys(row, controlKey, controlValue);
        var outputKeys = control?.VisibleOutputKeys ?? CollectVisibleOutputKeys(row, controlKey, controlValue);
        if (inputKeys.Count > 0)
        {
            item.InputParamKeys = inputKeys;
        }

        if (outputKeys.Count > 0)
        {
            item.OutputParamKeys = outputKeys;
        }
    }

    private static List<string> CollectVisibleInputKeys(
        StepRunnerDefinition row,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        return row.InputParamDefs
            .Where(p => !p.IsControlField)
            .Where(p => StepRunnerInputParamVisibility.IsInputVisible(
                p,
                controlFieldKey,
                controlFieldValue))
            .Select(p => (p.Key ?? string.Empty).Trim())
            .Where(k => k.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();
    }

    private static List<string> CollectVisibleOutputKeys(
        StepRunnerDefinition row,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        return row.OutputParamDefs
            .Where(p => StepRunnerInputParamVisibility.IsOutputVisible(
                p,
                controlFieldKey,
                controlFieldValue))
            .Select(p => (p.Key ?? string.Empty).Trim())
            .Where(k => k.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();
    }

    /// <summary>
    /// All agent-searchable control selections when the query did not pin a specific mode.
    /// </summary>
    private static List<StepRunnerControlFieldMatch> ListAllSearchableControlFields(
        StepRunnerDefinition row)
    {
        var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
        if (control is null || control.SelectionItems.Count == 0)
        {
            return new List<StepRunnerControlFieldMatch>();
        }

        var controlKey = control.Key ?? string.Empty;
        var moduleKey = row.Key ?? string.Empty;
        var list = new List<StepRunnerControlFieldMatch>();

        foreach (var si in control.SelectionItems)
        {
            var value = (si.Value ?? string.Empty).Trim();
            if (value.Length == 0)
            {
                continue;
            }

            if (StepRunnerAgentSearchFilter.IsControlValueExcludedFromSearch(moduleKey, value))
            {
                continue;
            }

            list.Add(
                EnrichControlFieldMatch(
                    row,
                    new StepRunnerControlFieldMatch
                    {
                        Key = controlKey,
                        Value = value,
                        Name = TrimToNull(si.Name) ?? string.Empty,
                    },
                    controlKey,
                    value));
        }

        return list;
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

        AppendAgentKeywordSnippet(dto, runner.Key ?? string.Empty);

        return dto;
    }

    private static void AppendAgentKeywordSnippet(StepRunnerAgentSchema dto, string key)
    {
        if (!StepRunnerAgentKeywordCatalog.TryGet(key, out var meta))
        {
            return;
        }

        var snippet = TrimToNull(meta.Snippet);
        if (snippet is null)
        {
            return;
        }

        if (dto.AgentGuidance is not null
            && dto.AgentGuidance.Contains(snippet, StringComparison.Ordinal))
        {
            return;
        }

        dto.AgentGuidance = dto.AgentGuidance is null
            ? snippet
            : dto.AgentGuidance + " | " + snippet;
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
