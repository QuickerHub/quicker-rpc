using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Quicker.Domain;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

public sealed class QuickerSettingsService
{
    private static readonly Lazy<IReadOnlyList<QuickerRpcSettingCatalogItem>> Catalog =
        new(BuildCatalog);

    private static readonly Lazy<IReadOnlyDictionary<string, QuickerSettingsPageMeta>> PagesById =
        new(BuildPagesById);

    public QuickerRpcSearchSettingsResult Search(string? query, int maxResults)
    {
        var limit = Clamp(maxResults, 1, 200);
        var q = (query ?? string.Empty).Trim();
        var pages = SearchPages(q, limit);
        var items = SearchCatalog(q, limit);

        return new QuickerRpcSearchSettingsResult
        {
            Ok = true,
            Query = q,
            Items = items.ToList(),
            Pages = pages.ToList(),
        };
    }

    public QuickerRpcListSettingsResult List(string? scope, int maxResults)
    {
        var limit = Clamp(maxResults, 1, 500);
        var normalizedScope = NormalizeScope(scope);
        var items = Catalog.Value
            .Where(item => normalizedScope is null
                           || string.Equals(item.Scope, normalizedScope, StringComparison.OrdinalIgnoreCase))
            .Take(limit)
            .ToList();

        if (normalizedScope is null
            || string.Equals(normalizedScope, QuickerSettingsScopes.GlobalSettings, StringComparison.OrdinalIgnoreCase))
        {
            if (QuickerSettingsAccessor.TryGetGlobalSettingsKeys(out var keys, out _))
            {
                foreach (var key in keys.Take(limit - items.Count))
                {
                    items.Add(new QuickerRpcSettingCatalogItem
                    {
                        Key = QuickerSettingsPath.BuildKey(QuickerSettingsScopes.GlobalSettings, key),
                        Scope = QuickerSettingsScopes.GlobalSettings,
                        Path = key,
                        Type = "String",
                        Writable = true,
                    });
                }
            }
        }

        return new QuickerRpcListSettingsResult
        {
            Ok = true,
            Scope = normalizedScope,
            Items = items,
        };
    }

    public QuickerRpcGetSettingResult Get(string key)
    {
        if (!QuickerSettingsPath.TryParseKey(key, out var parsed, out var parseError))
        {
            return FailGet(parseError ?? "Invalid key.");
        }

        if (string.Equals(parsed.Scope, QuickerSettingsScopes.GlobalSettings, StringComparison.OrdinalIgnoreCase))
        {
            if (!QuickerSettingsPath.TryGetValue(parsed, out var value, out var typeName, out var error))
            {
                return FailGet(error ?? "Failed to read setting.");
            }

            return new QuickerRpcGetSettingResult
            {
                Ok = true,
                Key = key,
                Scope = parsed.Scope,
                Path = parsed.Path,
                Type = typeName,
                Value = SerializeValue(value),
            };
        }

        if (!QuickerSettingsPath.TryGetValue(parsed, out var settingValue, out var settingType, out var getError))
        {
            return FailGet(getError ?? "Failed to read setting.");
        }

        return new QuickerRpcGetSettingResult
        {
            Ok = true,
            Key = key,
            Scope = parsed.Scope,
            Path = parsed.Path,
            ExeFile = parsed.ExeFile,
            Type = settingType,
            Value = SerializeValue(settingValue),
        };
    }

    public QuickerRpcSetSettingResult Set(string key, string value)
    {
        if (!QuickerSettingsPath.TryParseKey(key, out var parsed, out var parseError))
        {
            return FailSet(parseError ?? "Invalid key.");
        }

        string? setError = null;
        var setOk = string.Equals(parsed.Scope, QuickerSettingsScopes.GlobalSettings, StringComparison.OrdinalIgnoreCase)
            ? QuickerSettingsPath.TrySetGlobalSettingsValue(parsed.Path, value, out setError)
            : QuickerSettingsPath.TrySetValue(parsed, value, out setError);
        if (!setOk)
        {
            return FailSet(setError ?? "Failed to set setting.");
        }

        if (!QuickerSettingsPath.TryPersist(parsed, out var persistError))
        {
            return FailSet(persistError ?? "Failed to persist setting.");
        }

        var readBack = Get(key);
        return new QuickerRpcSetSettingResult
        {
            Ok = true,
            Key = key,
            Value = readBack.Value,
            Type = readBack.Type,
            Message = "Setting updated.",
        };
    }

    public QuickerRpcApplySettingsResult Apply(IList<QuickerRpcSettingChangeItem> changes)
    {
        if (changes is null || changes.Count == 0)
        {
            return new QuickerRpcApplySettingsResult
            {
                Ok = false,
                Message = "At least one change is required.",
            };
        }

        var results = new List<QuickerRpcSetSettingResult>(changes.Count);
        var applied = 0;
        var failed = 0;
        foreach (var change in changes)
        {
            var key = (change?.Key ?? string.Empty).Trim();
            if (key.Length == 0 || change?.Value is null)
            {
                failed++;
                results.Add(new QuickerRpcSetSettingResult
                {
                    Ok = false,
                    Key = key,
                    Message = "Each change requires key and value.",
                });
                continue;
            }

            var result = Set(key, change.Value);
            results.Add(result);
            if (result.Ok)
            {
                applied++;
            }
            else
            {
                failed++;
            }
        }

        return new QuickerRpcApplySettingsResult
        {
            Ok = failed == 0,
            AppliedCount = applied,
            FailedCount = failed,
            Results = results,
            Message = failed == 0
                ? $"Applied {applied} setting(s)."
                : $"Applied {applied}, failed {failed}.",
        };
    }

    private static IReadOnlyList<QuickerRpcSettingCatalogItem> SearchCatalog(string query, int limit)
    {
        if (query.Length == 0)
        {
            return Catalog.Value.Take(limit).ToList();
        }

        var tokens = TokenizeQuery(query);
        return Catalog.Value
            .Select(item => new { Item = item, Score = ScoreCatalogItem(item, query, tokens) })
            .Where(entry => entry.Score > 0)
            .OrderByDescending(entry => entry.Score)
            .ThenBy(entry => entry.Item.Key, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(entry => entry.Item)
            .ToList();
    }

    private static IReadOnlyList<QuickerRpcSettingPageSummary> SearchPages(string query, int limit)
    {
        var runtimePages = PagesById.Value.Values
            .Select(page => new { Page = ToPageSummary(page), Score = query.Length == 0 ? 1 : ScorePage(page, query, TokenizeQuery(query)) })
            .ToList();

        var jsonPages = QuickerSettingsAgentKeywordCatalog.All
            .Where(pair => pair.Key.StartsWith("page:", StringComparison.Ordinal)
                           && string.Equals(pair.Value.Kind, "page", StringComparison.OrdinalIgnoreCase))
            .Select(pair => new
            {
                Page = new QuickerRpcSettingPageSummary
                {
                    PageId = pair.Value.PageId ?? pair.Key.Substring("page:".Length),
                    Title = pair.Value.Title ?? pair.Key,
                    Description = pair.Value.Snippet,
                    Keywords = pair.Value.Keywords.Count > 0 ? string.Join(", ", pair.Value.Keywords) : null,
                },
                Score = query.Length == 0 ? 1 : ScoreKeywordEntry(pair.Value, query, TokenizeQuery(query)),
            });

        return runtimePages
            .Concat(jsonPages)
            .Where(entry => query.Length == 0 || entry.Score > 0)
            .GroupBy(entry => entry.Page.PageId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(entry => entry.Score).First())
            .OrderByDescending(entry => entry.Score)
            .ThenBy(entry => entry.Page.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(entry => entry.Page)
            .ToList();
    }

    private static int ScoreCatalogItem(
        QuickerRpcSettingCatalogItem item,
        string query,
        IReadOnlyList<string> tokens)
    {
        var score = 0;
        if (Contains(item.Key, query))
        {
            score += 120;
        }

        if (Contains(item.Path, query))
        {
            score += 100;
        }

        if (Contains(item.Title, query))
        {
            score += 140;
        }

        if (Contains(item.Snippet, query) || Contains(item.Description, query))
        {
            score += 60;
        }

        if (Contains(item.PageTitle, query))
        {
            score += 40;
        }

        if (KeywordTextMatches(item.Keywords, query, tokens))
        {
            score += 90;
        }

        if (QuickerSettingsAgentKeywordCatalog.TryGet(item.Key, out var meta))
        {
            score += ScoreKeywordEntry(meta, query, tokens);
        }

        return score;
    }

    private static int ScorePage(QuickerSettingsPageMeta page, string query, IReadOnlyList<string> tokens)
    {
        var score = 0;
        if (Contains(page.Title, query))
        {
            score += 100;
        }

        if (Contains(page.Description, query))
        {
            score += 80;
        }

        if (KeywordTextMatches(page.Keywords, query, tokens))
        {
            score += 70;
        }

        if (Contains(page.PageId, query))
        {
            score += 50;
        }

        var pageKey = "page:" + page.PageId;
        if (QuickerSettingsAgentKeywordCatalog.TryGet(pageKey, out var meta))
        {
            score += ScoreKeywordEntry(meta, query, tokens);
        }

        return score;
    }

    private static int ScoreKeywordEntry(
        QuickerSettingsAgentKeywordEntry meta,
        string query,
        IReadOnlyList<string> tokens)
    {
        var score = meta.RankBias;
        if (Contains(meta.Title, query))
        {
            score += 150;
        }

        if (Contains(meta.Snippet, query))
        {
            score += 70;
        }

        foreach (var keyword in meta.Keywords)
        {
            if (KeywordMatches(keyword, query, tokens))
            {
                score += 95;
            }
        }

        return score;
    }

    private static bool KeywordTextMatches(string? keywords, string query, IReadOnlyList<string> tokens)
    {
        if (string.IsNullOrWhiteSpace(keywords))
        {
            return false;
        }

        foreach (var keyword in keywords.Split(new[] { ',', ';', '|' }, StringSplitOptions.RemoveEmptyEntries))
        {
            if (KeywordMatches(keyword.Trim(), query, tokens))
            {
                return true;
            }
        }

        return false;
    }

    private static bool KeywordMatches(string keyword, string query, IReadOnlyList<string> tokens)
    {
        if (keyword.Length == 0)
        {
            return false;
        }

        if (Contains(keyword, query) || Contains(query, keyword))
        {
            return true;
        }

        return tokens.Any(token => token.Length > 0 && (Contains(keyword, token) || Contains(token, keyword)));
    }

    private static IReadOnlyList<string> TokenizeQuery(string query)
    {
        return query
            .Split(new[] { ' ', '\t', ',', ';', '|' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(token => token.Trim())
            .Where(token => token.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool Contains(string? text, string query) =>
        !string.IsNullOrWhiteSpace(text)
        && text.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;

    private static void EnrichFromKeywords(QuickerRpcSettingCatalogItem item)
    {
        if (!QuickerSettingsAgentKeywordCatalog.TryGet(item.Key, out var meta))
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(meta.Title))
        {
            item.Title = meta.Title;
        }

        if (!string.IsNullOrWhiteSpace(meta.Snippet))
        {
            item.Snippet = meta.Snippet;
            item.Description = meta.Snippet;
        }

        if (meta.Keywords.Count > 0)
        {
            item.Keywords = string.Join(", ", meta.Keywords);
        }

        if (!string.IsNullOrWhiteSpace(meta.PageId))
        {
            item.PageId = meta.PageId;
            if (PagesById.Value.TryGetValue(meta.PageId, out var page))
            {
                item.PageTitle = page.Title;
            }
        }
    }

    private static QuickerRpcSettingPageSummary ToPageSummary(QuickerSettingsPageMeta page) =>
        new()
        {
            PageId = page.PageId,
            Title = page.Title,
            Description = page.Description,
            Keywords = page.Keywords,
        };

    private static string? SerializeValue(object? value)
    {
        if (value is null)
        {
            return null;
        }

        if (value is string or bool or int or long or float or double or decimal)
        {
            return Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
        }

        if (value.GetType().IsEnum)
        {
            return value.ToString();
        }

        return JsonSerializer.Serialize(value);
    }

    private static string? NormalizeScope(string? scope)
    {
        var text = (scope ?? string.Empty).Trim();
        return text.Length == 0 ? null : text;
    }

    private static IReadOnlyList<QuickerRpcSettingCatalogItem> BuildCatalog()
    {
        var items = new List<QuickerRpcSettingCatalogItem>();
        var pages = PagesById.Value;

        if (QuickerSettingsAccessor.ResolveCatalogType(QuickerSettingsScopes.UserSettings) is { } userSettingsType)
        {
            AppendCatalogEntries(QuickerSettingsScopes.UserSettings, userSettingsType, string.Empty, items, pages);
        }

        if (QuickerSettingsAccessor.ResolveCatalogType(QuickerSettingsScopes.UserPreference) is { } userPreferenceType)
        {
            AppendCatalogEntries(QuickerSettingsScopes.UserPreference, userPreferenceType, string.Empty, items, pages);
        }

        if (QuickerSettingsAccessor.ResolveCatalogType(QuickerSettingsScopes.ExeSettings) is { } exeSettingsType)
        {
            AppendCatalogEntries(QuickerSettingsScopes.ExeSettings, exeSettingsType, string.Empty, items, pages);
        }

        return items;
    }

    private static void AppendCatalogEntries(
        string scope,
        Type rootType,
        string pathPrefix,
        IList<QuickerRpcSettingCatalogItem> items,
        IReadOnlyDictionary<string, QuickerSettingsPageMeta> pagesById)
    {
        foreach (var property in rootType
                     .GetProperties(QuickerAssemblyReflection.InstanceFlags)
                     .Where(property => property.CanRead && property.GetIndexParameters().Length == 0)
                     .OrderBy(property => property.Name, StringComparer.OrdinalIgnoreCase))
        {
            var path = string.IsNullOrEmpty(pathPrefix) ? property.Name : $"{pathPrefix}.{property.Name}";
            var propertyType = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;

            if (IsScalar(propertyType))
            {
                var item = new QuickerRpcSettingCatalogItem
                {
                    Key = QuickerSettingsPath.BuildKey(scope, path),
                    Scope = scope,
                    Path = path,
                    Type = QuickerSettingsPath.DescribeType(property.PropertyType),
                    Writable = property.CanWrite,
                };
                EnrichFromKeywords(item);
                items.Add(item);
                continue;
            }

            if (IsComplexLeaf(propertyType))
            {
                var item = new QuickerRpcSettingCatalogItem
                {
                    Key = QuickerSettingsPath.BuildKey(scope, path),
                    Scope = scope,
                    Path = path,
                    Type = QuickerSettingsPath.DescribeType(property.PropertyType),
                    Writable = property.CanWrite,
                    Description = scope == QuickerSettingsScopes.ExeSettings
                        ? "Per-exe setting; use exeSettings:<exeFile>:<path>."
                        : "Complex setting.",
                };
                EnrichFromKeywords(item);
                items.Add(item);
                continue;
            }

            if (propertyType.IsClass)
            {
                AppendCatalogEntries(scope, propertyType, path, items, pagesById);
            }
        }
    }

    private static bool IsScalar(Type type) =>
        type.IsPrimitive
        || type == typeof(string)
        || type == typeof(decimal)
        || type.IsEnum
        || type == typeof(DateTime);

    private static bool IsComplexLeaf(Type type) =>
        typeof(System.Collections.IEnumerable).IsAssignableFrom(type) && type != typeof(string);

    private static IReadOnlyDictionary<string, QuickerSettingsPageMeta> BuildPagesById()
    {
        var pages = new Dictionary<string, QuickerSettingsPageMeta>(StringComparer.OrdinalIgnoreCase);
        if (!QuickerHost.IsRunningInQuicker())
        {
            return pages;
        }

        try
        {
            var assembly = QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var quicker)
                ? quicker
                : typeof(AppState).Assembly;
            var providerType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, "Quicker.Settings.SettingsMenuProvider");
            if (providerType is null)
            {
                return pages;
            }

            var instance = providerType
                .GetFields(QuickerAssemblyReflection.StaticFlags)
                .FirstOrDefault(field => field.FieldType == providerType)
                ?.GetValue(null);
            if (instance is null)
            {
                return pages;
            }

            var allPagesProperty = providerType.GetProperty("AllPages", QuickerAssemblyReflection.InstanceFlags);
            if (allPagesProperty?.GetValue(instance) is not System.Collections.IEnumerable allPages)
            {
                return pages;
            }

            var pageInfoType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, "Quicker.Settings.Code.SettingPageInfo");
            if (pageInfoType is null)
            {
                return pages;
            }

            foreach (var page in allPages)
            {
                if (page is null)
                {
                    continue;
                }

                var pageId = ReadSettingPageId(page);
                var meta = new QuickerSettingsPageMeta
                {
                    PageId = pageId,
                    Title = ReadStringProperty(page, "Title") ?? string.Empty,
                    Description = ReadStringProperty(page, "Description"),
                    Keywords = ReadStringProperty(page, "KeyWords"),
                };

                if (meta.PageId.Length > 0)
                {
                    pages[meta.PageId] = meta;
                }
            }
        }
        catch
        {
            // Catalog still works without page metadata.
        }

        return pages;
    }

    private static string ReadSettingPageId(object page)
    {
        var idProperty = page.GetType().GetProperty("Id", QuickerAssemblyReflection.InstanceFlags);
        var idValue = idProperty?.GetValue(page);
        return idValue?.ToString() ?? string.Empty;
    }

    private static string? ReadStringProperty(object target, string propertyName)
    {
        var property = target.GetType().GetProperty(propertyName, QuickerAssemblyReflection.InstanceFlags);
        return property?.GetValue(target)?.ToString();
    }

    private static QuickerRpcGetSettingResult FailGet(string message) =>
        new()
        {
            Ok = false,
            Message = message,
        };

    private static QuickerRpcSetSettingResult FailSet(string message) =>
        new()
        {
            Ok = false,
            Message = message,
        };

    private static int Clamp(int value, int min, int max)
    {
        if (value < min)
        {
            return min;
        }

        return value > max ? max : value;
    }
}
