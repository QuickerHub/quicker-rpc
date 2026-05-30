using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Searches local Quicker actions. Uses reflection so the plugin stays compatible across Quicker versions.
/// </summary>
public sealed class ActionSearchService
{
    private readonly Func<string, int, IReadOnlyList<QuickerRpcActionSummary>>? _search;

    public ActionSearchService()
    {
        _search = TryCreateSearchDelegate();
    }

    public QuickerRpcActionSearchResult SearchActions(string query, int maxCount)
    {
        if (_search is null)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = "Not running inside Quicker (action search unavailable).",
            };
        }

        var keyword = (query ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(keyword))
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Message = "query is required.",
            };
        }

        try
        {
            var limit = NormalizeMaxCount(maxCount);
            var items = _search(keyword, limit);
            return new QuickerRpcActionSearchResult
            {
                Ok = true,
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
            var storeType = typeof(AppState).Assembly.GetType(
                "Quicker.Domain.Services.ActionItem2Store",
                throwOnError: false);
            if (storeType is not null)
            {
                var store = ResolveAppStateService(storeType)
                    ?? ResolveAppStateStaticProperty(storeType, "ActionItem2Store");
                var getAll = storeType.GetMethod("GetAllActionItems", BindingFlags.Public | BindingFlags.Instance);
                if (store is not null && getAll is not null)
                {
                    search = (keyword, limit) =>
                    {
                        var raw = getAll.Invoke(store, null);
                        return FilterActions(raw as IEnumerable, keyword, limit);
                    };
                    return true;
                }
            }

            var dataService = typeof(AppState).GetProperty("DataService", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
            var getAllLegacy = dataService?.GetType().GetMethod(
                "GetAllActionItems",
                BindingFlags.Public | BindingFlags.Instance);
            if (dataService is not null && getAllLegacy is not null)
            {
                search = (keyword, limit) =>
                {
                    var raw = getAllLegacy.Invoke(dataService, null);
                    return FilterActions(raw as IEnumerable, keyword, limit);
                };
                return true;
            }

            return false;
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

            var score = ComputeSimpleMatchScore(action, keyword);
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

    private static int ComputeSimpleMatchScore(object action, string keyword)
    {
        var id = ReadActionId(action);
        var title = ReadActionTitle(action) ?? string.Empty;
        var description = ReadActionDescription(action) ?? string.Empty;

        if (!string.IsNullOrEmpty(id)
            && string.Equals(id, keyword, StringComparison.OrdinalIgnoreCase))
        {
            return 200;
        }

        if (title.Equals(keyword, StringComparison.OrdinalIgnoreCase))
        {
            return 150;
        }

        if (title.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return 100;
        }

        if (description.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return 60;
        }

        return 0;
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

    private static object? ResolveAppStateService(Type serviceType)
    {
        var getService = typeof(AppState).GetMethod(
            "GetService",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(Type) },
            modifiers: null);
        return getService?.Invoke(null, new object[] { serviceType });
    }

    private static object? ResolveAppStateStaticProperty(Type serviceType, string propertyName)
    {
        var property = typeof(AppState).GetProperty(propertyName, BindingFlags.Public | BindingFlags.Static);
        if (property is null || !serviceType.IsAssignableFrom(property.PropertyType))
        {
            return null;
        }

        return property.GetValue(null);
    }

    private static bool TryGetIgnoreCaseSearchSetting()
    {
        try
        {
            var settings = typeof(AppState).GetProperty("SearchSettings2", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
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

    private static bool IsInQuicker()
    {
        return Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
    }
}
