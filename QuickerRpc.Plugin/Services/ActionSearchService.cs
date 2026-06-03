using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Searches local Quicker actions. Prefers <see cref="QuickerInternalAccess"/> catalog; falls back to IActionSearchService via reflection.
/// </summary>
public sealed class ActionSearchService
{
    private readonly Func<string, int, IReadOnlyList<QuickerRpcActionSummary>>? _search;

    public ActionSearchService()
    {
        _search = TryCreateSearchDelegate();
    }

    public QuickerRpcActionSearchResult SearchActions(string query, int maxCount, string? scope)
    {
        if (_search is null && string.IsNullOrWhiteSpace(scope))
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = "Not running inside Quicker (action search unavailable).",
            };
        }

        var keyword = (query ?? string.Empty).Trim();
        var scopeValue = string.IsNullOrWhiteSpace(scope) ? null : scope.Trim();

        if (string.IsNullOrEmpty(keyword))
        {
            return SearchRecentActions(scopeValue, maxCount);
        }

        if (ActionSearchQuery.TryParseSubProgramReference(keyword, out var subProgramSearch))
        {
            if (!ActionSubProgramCallScanner.TryResolveSubProgram(
                    subProgramSearch.SubProgramRef,
                    out _,
                    out _,
                    out var resolveError))
            {
                return new QuickerRpcActionSearchResult
                {
                    Ok = false,
                    Scope = scopeValue,
                    Message = resolveError ?? $"Subprogram not found: {subProgramSearch.SubProgramRef}",
                };
            }

            return SearchSubProgramReference(subProgramSearch, keyword, scopeValue, maxCount);
        }

        if (!string.IsNullOrWhiteSpace(scopeValue) && ProfileManagerAccessor.TryCreate() is null)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = "ProfileManager unavailable (scope filter requires Quicker runtime).",
            };
        }

        try
        {
            var limit = NormalizeMaxCount(maxCount);
            IReadOnlyList<QuickerRpcActionSummary> items;
            if (!string.IsNullOrWhiteSpace(scopeValue))
            {
                items = SearchScopedCatalog(keyword, scopeValue, limit);
            }
            else if (_search is not null)
            {
                var fromNative = EnrichSummaries(_search(keyword, limit));
                var fromCatalog = SearchScopedCatalog(keyword, scope: null, limit);
                items = MergeSearchResults(fromNative, fromCatalog, limit);
            }
            else
            {
                items = SearchScopedCatalog(keyword, scope: null, limit);
            }

            return new QuickerRpcActionSearchResult
            {
                Ok = true,
                Scope = scopeValue,
                Message = items.Count == 0 ? "No matching actions." : string.Empty,
                Items = items.ToList(),
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = ex.Message,
            };
        }
    }

    private QuickerRpcActionSearchResult SearchSubProgramReference(
        SubProgramReferenceSearch search,
        string query,
        string? scope,
        int maxCount)
    {
        if (!string.IsNullOrWhiteSpace(scope) && ProfileManagerAccessor.TryCreate() is null)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = "ProfileManager unavailable (scope filter requires Quicker runtime).",
            };
        }

        try
        {
            var limit = NormalizeMaxCount(maxCount);
            var items = SearchScopedCatalog(query, scope ?? string.Empty, limit);
            return new QuickerRpcActionSearchResult
            {
                Ok = true,
                Scope = scope,
                Message = items.Count == 0
                    ? search.DedicatedOnly
                        ? $"No actions dedicated to subprogram '{search.SubProgramRef}'."
                        : $"No actions call subprogram '{search.SubProgramRef}'."
                    : string.Empty,
                Items = items.ToList(),
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = ex.Message,
            };
        }
    }

    private static IReadOnlyList<QuickerRpcActionSummary> SearchScopedCatalog(string keyword, string? scope, int limit)
    {
        return ActionCatalogSearch.Match(keyword, scope, limit)
            .Select(x => new QuickerRpcActionSummary
            {
                Id = (x.Entry.Action.Id ?? string.Empty).Trim(),
                Title = x.Entry.Action.Title ?? string.Empty,
                Description = NullIfEmpty(x.Entry.Action.Description),
                PageTitle = NullIfEmpty(x.Entry.Profile?.Name),
                ProfileId = x.Entry.Profile?.Id,
                ProfileName = x.Entry.Profile?.Name,
                ExeFile = x.Entry.Profile?.ExeFile,
                Score = x.Score,
            })
            .Where(x => x.Id.Length > 0)
            .ToList();
    }

    private static IReadOnlyList<QuickerRpcActionSummary> EnrichSummaries(IReadOnlyList<QuickerRpcActionSummary> items)
    {
        var locationById = ActionCatalogEnumerator.Enumerate(scope: null)
            .GroupBy(x => (x.Action.Id ?? string.Empty).Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var enriched = new List<QuickerRpcActionSummary>();
        foreach (var item in items)
        {
            if (locationById.TryGetValue(item.Id, out var entry))
            {
                item.PageTitle ??= NullIfEmpty(entry.Profile?.Name);
                item.ProfileId ??= entry.Profile?.Id;
                item.ProfileName ??= entry.Profile?.Name;
                item.ExeFile ??= entry.Profile?.ExeFile;
            }

            enriched.Add(item);
        }

        return enriched;
    }

    private static Func<string, int, IReadOnlyList<QuickerRpcActionSummary>>? TryCreateSearchDelegate()
    {
        if (!IsInQuicker())
        {
            return null;
        }

        if (TryCreateActionSearchServiceDelegate(out var fromSearchService))
        {
            return fromSearchService;
        }

        if (TryCreateStoreDelegate(out var fromStore))
        {
            return fromStore;
        }

        return null;
    }

    private static bool TryCreateActionSearchServiceDelegate(
        out Func<string, int, IReadOnlyList<QuickerRpcActionSummary>> search)
    {
        search = null!;

        try
        {
            var searchServiceType = typeof(AppState).Assembly.GetType(
                "Quicker.Domain.Services.IActionSearchService",
                throwOnError: false);
            if (searchServiceType is null)
            {
                return false;
            }

            var searchService = ResolveAppStateService(searchServiceType);
            if (searchService is null)
            {
                return false;
            }

            var searchActions = searchServiceType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "SearchActions", StringComparison.Ordinal)
                    && m.GetParameters().Length == 5
                    && m.GetParameters()[0].ParameterType.Name == "QueryContext");
            if (searchActions is null)
            {
                return false;
            }

            var queryContextType = searchActions.GetParameters()[0].ParameterType;
            search = (keyword, limit) =>
            {
                var queryContext = Activator.CreateInstance(queryContextType)
                    ?? throw new InvalidOperationException("Failed to create QueryContext.");

                var setSearch = queryContextType.GetMethod("SetSearch");
                if (setSearch is null)
                {
                    throw new InvalidOperationException("QueryContext.SetSearch not found.");
                }

                var ignoreCase = TryGetIgnoreCaseSearchSetting();
                setSearch.Invoke(queryContext, new object[] { keyword, ignoreCase });

                var rawResults = searchActions.Invoke(
                    searchService,
                    new object[] { queryContext, false, false, false, false });
                if (rawResults is not IEnumerable enumerable)
                {
                    return Array.Empty<QuickerRpcActionSummary>();
                }

                return MapSearchResults(enumerable, limit);
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryCreateStoreDelegate(out Func<string, int, IReadOnlyList<QuickerRpcActionSummary>> search)
    {
        search = null!;

        try
        {
            if (!QuickerInternalAccess.IsCatalogAvailable)
            {
                return false;
            }

            search = (keyword, limit) => FilterActionItems(QuickerInternalAccess.EnumerateAllActionItems(), keyword, limit);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static IReadOnlyList<QuickerRpcActionSummary> MapSearchResults(IEnumerable results, int limit)
    {
        var scored = new List<(int Score, QuickerRpcActionSummary Item)>();
        foreach (var result in results)
        {
            if (result is null)
            {
                continue;
            }

            var resultType = result.GetType();
            var action = resultType.GetProperty("Action")?.GetValue(result)
                ?? resultType.GetField("Action")?.GetValue(result);
            if (action is null)
            {
                continue;
            }

            var score = ReadIntMember(result, "Score") ?? 0;
            var pageTitle = ReadStringMember(result, "PageTitle");
            var summary = MapActionObject(action, pageTitle, score);
            if (summary is not null)
            {
                scored.Add((score, summary));
            }
        }

        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Item.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => x.Item)
            .ToList();
    }

    private static IReadOnlyList<QuickerRpcActionSummary> FilterActionItems(
        IEnumerable<ActionItem> actions,
        string keyword,
        int limit)
    {
        var scored = new List<(int Score, QuickerRpcActionSummary Item)>();
        foreach (var action in actions)
        {
            var score = ComputeSimpleMatchScore(action, keyword);
            if (score <= 0)
            {
                continue;
            }

            var summary = MapActionItem(action, pageTitle: null, score);
            if (summary is not null)
            {
                scored.Add((score, summary));
            }
        }

        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Item.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => x.Item)
            .ToList();
    }

    private static int ComputeSimpleMatchScore(ActionItem action, string keyword) =>
        ActionSearchFuzzyMatch.ComputeScore(
            keyword,
            action.Id,
            action.Title ?? string.Empty,
            action.Description,
            profileName: null,
            exeFile: null);

    private static IReadOnlyList<QuickerRpcActionSummary> FilterActions(IEnumerable? actions, string keyword, int limit)
    {
        if (actions is null)
        {
            return Array.Empty<QuickerRpcActionSummary>();
        }

        var scored = new List<(int Score, QuickerRpcActionSummary Item)>();
        foreach (var action in actions)
        {
            if (action is null)
            {
                continue;
            }

            if (action is ActionItem ai)
            {
                var typedScore = ComputeSimpleMatchScore(ai, keyword);
                if (typedScore > 0)
                {
                    var typedSummary = MapActionItem(ai, pageTitle: null, typedScore);
                    if (typedSummary is not null)
                    {
                        scored.Add((typedScore, typedSummary));
                    }
                }

                continue;
            }

            var score = ComputeSimpleMatchScoreLegacy(action, keyword);
            if (score <= 0)
            {
                continue;
            }

            var summary = MapActionObject(action, pageTitle: null, score: score);
            if (summary is not null)
            {
                scored.Add((score, summary));
            }
        }

        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Item.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => x.Item)
            .ToList();
    }

    private static int ComputeSimpleMatchScoreLegacy(object action, string keyword) =>
        ActionSearchFuzzyMatch.ComputeScore(
            keyword,
            ReadActionId(action),
            ReadActionTitle(action) ?? string.Empty,
            ReadActionDescription(action));

    private QuickerRpcActionSearchResult SearchRecentActions(string? scope, int maxCount)
    {
        try
        {
            var limit = NormalizeMaxCount(maxCount);
            var matches = ActionCatalogSearch.ListRecentByLastEdit(
                scope,
                limit,
                actionFilter: null);

            var items = EnrichSummaries(matches
                .Select(x => new QuickerRpcActionSummary
                {
                    Id = (x.Entry.Action.Id ?? string.Empty).Trim(),
                    Title = x.Entry.Action.Title ?? string.Empty,
                    Description = NullIfEmpty(x.Entry.Action.Description),
                    PageTitle = NullIfEmpty(x.Entry.Profile?.Name),
                    ProfileId = x.Entry.Profile?.Id,
                    ProfileName = x.Entry.Profile?.Name,
                    ExeFile = x.Entry.Profile?.ExeFile,
                    Score = x.Score,
                })
                .Where(x => x.Id.Length > 0)
                .ToList());

            return new QuickerRpcActionSearchResult
            {
                Ok = true,
                Scope = scope,
                Message = items.Count == 0 ? "No recently edited actions." : string.Empty,
                Items = items.ToList(),
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = ex.Message,
            };
        }
    }

    private static IReadOnlyList<QuickerRpcActionSummary> MergeSearchResults(
        IReadOnlyList<QuickerRpcActionSummary> primary,
        IReadOnlyList<QuickerRpcActionSummary> catalog,
        int limit)
    {
        var merged = new Dictionary<string, QuickerRpcActionSummary>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in primary.Concat(catalog))
        {
            var id = (item.Id ?? string.Empty).Trim();
            if (id.Length == 0)
            {
                continue;
            }

            if (!merged.TryGetValue(id, out var existing) || item.Score > existing.Score)
            {
                merged[id] = item;
            }
        }

        return merged.Values
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();
    }

    private static QuickerRpcActionSummary? MapActionItem(ActionItem action, string? pageTitle, int score)
    {
        var id = (action.Id ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        return new QuickerRpcActionSummary
        {
            Id = id,
            Title = action.Title ?? string.Empty,
            Description = NullIfEmpty(action.Description),
            PageTitle = NullIfEmpty(pageTitle),
            Score = score,
            SharedActionId = null,
        };
    }

    private static QuickerRpcActionSummary? MapActionObject(object action, string? pageTitle, int score)
    {
        var id = ReadActionId(action);
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        return new QuickerRpcActionSummary
        {
            Id = id,
            Title = ReadActionTitle(action) ?? string.Empty,
            Description = NullIfEmpty(ReadActionDescription(action)),
            PageTitle = NullIfEmpty(pageTitle),
            Score = score,
            SharedActionId = NullIfEmpty(ReadSharedActionId(action)),
        };
    }

    private static string? ReadActionId(object action)
    {
        var idValue = action.GetType().GetProperty("Id")?.GetValue(action);
        return idValue switch
        {
            Guid guid when guid != Guid.Empty => guid.ToString("D"),
            string text when !string.IsNullOrWhiteSpace(text) => text.Trim(),
            _ => null,
        };
    }

    private static string? ReadActionTitle(object action)
    {
        var presentation = action.GetType().GetProperty("Presentation")?.GetValue(action);
        var fromPresentation = ReadStringMember(presentation, "Title");
        if (!string.IsNullOrWhiteSpace(fromPresentation))
        {
            return fromPresentation;
        }

        return ReadStringMember(action, "Title");
    }

    private static string? ReadActionDescription(object action)
    {
        var presentation = action.GetType().GetProperty("Presentation")?.GetValue(action);
        var fromPresentation = ReadStringMember(presentation, "Description");
        if (!string.IsNullOrWhiteSpace(fromPresentation))
        {
            return fromPresentation;
        }

        return ReadStringMember(action, "Description");
    }

    private static string? ReadSharedActionId(object action)
    {
        var sharedInfo = action.GetType().GetProperty("SharedActionInfo")?.GetValue(action);
        var fromInfo = ReadGuidMember(sharedInfo, "SharedActionId");
        if (!string.IsNullOrWhiteSpace(fromInfo))
        {
            return fromInfo;
        }

        return ReadGuidMember(action, "SharedActionId");
    }

    private static object? ResolveAppStateService(Type serviceType) =>
        QuickerInternalAccess.TryGetService(serviceType);

    private static object? ResolveAppStateStaticProperty(Type serviceType, string propertyName)
    {
        var value = QuickerInternalAccess.TryGetAppStateStaticProperty(propertyName);
        return value is not null && serviceType.IsInstanceOfType(value) ? value : null;
    }

    private static bool TryGetIgnoreCaseSearchSetting()
    {
        try
        {
            var settings = QuickerInternalAccess.TryGetAppStateStaticProperty("SearchSettings2");
            var matchUpper = settings?.GetType().GetProperty("MatchUpperCaseEqual")?.GetValue(settings);
            if (matchUpper is bool value)
            {
                return !value;
            }
        }
        catch
        {
            // ignore
        }

        return true;
    }

    private static string? ReadStringMember(object? target, string memberName)
    {
        if (target is null)
        {
            return null;
        }

        var value = target.GetType().GetProperty(memberName)?.GetValue(target)
            ?? target.GetType().GetField(memberName)?.GetValue(target);
        return value as string;
    }

    private static int? ReadIntMember(object? target, string memberName)
    {
        if (target is null)
        {
            return null;
        }

        var value = target.GetType().GetProperty(memberName)?.GetValue(target)
            ?? target.GetType().GetField(memberName)?.GetValue(target);
        return value switch
        {
            int number => number,
            _ => null,
        };
    }

    private static string? ReadGuidMember(object? target, string memberName)
    {
        if (target is null)
        {
            return null;
        }

        var value = target.GetType().GetProperty(memberName)?.GetValue(target)
            ?? target.GetType().GetField(memberName)?.GetValue(target);
        return value switch
        {
            Guid guid when guid != Guid.Empty => guid.ToString("D"),
            string text when Guid.TryParse(text, out var parsed) && parsed != Guid.Empty => parsed.ToString("D"),
            _ => null,
        };
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    private static int NormalizeMaxCount(int maxCount)
    {
        if (maxCount < 1)
        {
            return 1;
        }

        return maxCount > 100 ? 100 : maxCount;
    }

    private static bool IsInQuicker() => QuickerInternalAccess.IsInQuicker;
}
