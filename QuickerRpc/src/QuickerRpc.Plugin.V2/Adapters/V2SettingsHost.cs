using System.Collections;
using System.Globalization;
using System.Reflection;
using Newtonsoft.Json;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2SettingsHost : IQuickerRpcSettingsHost
{
    private const string UserSettingsScope = "userSettings";
    private const string GlobalSettingsScope = "globalSettings";
    private const string ExeSettingsScope = "exeSettings";

    private static readonly Lazy<IReadOnlyList<QuickerRpcSettingCatalogItem>> Catalog =
        new(BuildCatalog);

    public Task<QuickerRpcSearchSettingsResult> SearchAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var q = (query ?? string.Empty).Trim();
        var limit = Math.Clamp(maxResults, 1, 200);
        var items = Catalog.Value
            .Where(item => q.Length == 0
                           || Contains(item.Key, q)
                           || Contains(item.Path, q)
                           || Contains(item.Title, q))
            .Take(limit)
            .ToList();
        return Task.FromResult(new QuickerRpcSearchSettingsResult
        {
            Ok = true,
            Query = q,
            Items = items,
            Message = "Quicker V2 settings catalog uses UserSettings2 and ExeSettings2.",
        });
    }

    public Task<QuickerRpcListSettingsResult> ListAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var normalized = (scope ?? string.Empty).Trim();
        var items = Catalog.Value
            .Where(item => normalized.Length == 0
                           || string.Equals(item.Scope, normalized, StringComparison.OrdinalIgnoreCase))
            .Take(Math.Clamp(maxResults, 1, 500))
            .ToList();
        return Task.FromResult(new QuickerRpcListSettingsResult
        {
            Ok = true,
            Scope = normalized.Length == 0 ? null : normalized,
            Items = items,
        });
    }

    public Task<QuickerRpcGetSettingResult> GetAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(Get(key));
    }

    public Task<QuickerRpcSetSettingResult> SetAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(Set(key, value));
    }

    public Task<QuickerRpcApplySettingsResult> ApplyAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (changes is null || changes.Count == 0)
        {
            return Task.FromResult(new QuickerRpcApplySettingsResult
            {
                Ok = false,
                Message = "At least one change is required.",
            });
        }

        var results = changes.Select(change => Set(change.Key, change.Value)).ToList();
        var applied = results.Count(result => result.Ok);
        return Task.FromResult(new QuickerRpcApplySettingsResult
        {
            Ok = applied == results.Count,
            AppliedCount = applied,
            FailedCount = results.Count - applied,
            Results = results,
            Message = applied == results.Count
                ? $"Applied {applied} setting(s)."
                : $"Applied {applied}, failed {results.Count - applied}.",
        });
    }

    public Task<QuickerRpcListSettingsPagesResult> ListPagesAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new QuickerRpcListSettingsPagesResult
        {
            Ok = true,
            Pages =
            [
                new QuickerRpcSettingsPageInfo
                {
                    Target = "settings",
                    Title = "Quicker 设置",
                    Aliases = ["settings", "config", "设置"],
                    Snippet = "Open the Quicker V2 settings window.",
                },
                new QuickerRpcSettingsPageInfo
                {
                    Target = "search",
                    Title = "搜索设置",
                    Aliases = ["search", "搜索"],
                    Snippet = "Open Quicker V2 settings search.",
                },
            ],
        });
    }

    public Task<QuickerRpcListSettingsDirectLinksResult> ListDirectLinksAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new QuickerRpcListSettingsDirectLinksResult
        {
            Ok = true,
            Message = "Legacy V1 direct-link presets are not exposed by the V2 settings API.",
        });
    }

    public Task<QuickerRpcOpenSettingsUiResult> OpenUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new QuickerRpcOpenSettingsUiResult
        {
            Ok = false,
            Target = (target ?? string.Empty).Trim(),
            Message = "Quicker V2 settings UI navigation API is unavailable; use headless get/set/list.",
        });
    }

    public Task<QuickerRpcResolveSettingsIntentResult> ResolveIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var key = (settingKey ?? string.Empty).Trim();
        if (key.Length > 0)
        {
            return Task.FromResult(new QuickerRpcResolveSettingsIntentResult
            {
                Ok = true,
                Intent = "headless-setting",
                Target = "setting",
                SettingKey = key,
                SuggestedAction = "get",
                Message = "Use headless V2 settings access.",
            });
        }

        return Task.FromResult(new QuickerRpcResolveSettingsIntentResult
        {
            Ok = false,
            Intent = "unknown",
            Target = (query ?? string.Empty).Trim(),
            Message = "Quicker V2 settings UI intent could not be resolved.",
        });
    }

    private static QuickerRpcGetSettingResult Get(string key)
    {
        if (!TryResolveLeaf(key, forWrite: false, out var parsed, out var root, out var leaf, out var error)
            || root is null
            || leaf is null)
        {
            return new QuickerRpcGetSettingResult { Ok = false, Key = key ?? string.Empty, Message = error };
        }

        try
        {
            var value = leaf.GetValue(root);
            return new QuickerRpcGetSettingResult
            {
                Ok = true,
                Key = key,
                Scope = parsed.Scope,
                Path = parsed.Path,
                ExeFile = parsed.ExeFile,
                Type = FriendlyTypeName(leaf.PropertyType),
                Value = SerializeValue(value),
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcGetSettingResult { Ok = false, Key = key, Message = ex.Message };
        }
    }

    private static QuickerRpcSetSettingResult Set(string key, string value)
    {
        if (!TryResolveLeaf(key, forWrite: true, out var parsed, out var root, out var leaf, out var error)
            || root is null
            || leaf is null)
        {
            return SetFail(key, error ?? "Setting not found.");
        }

        if (!leaf.CanWrite)
        {
            return SetFail(key, "Setting is read-only.");
        }

        try
        {
            leaf.SetValue(root, ConvertValue(value, leaf.PropertyType));
            if (!Persist(parsed, out var persistError))
            {
                return SetFail(key, persistError ?? "Failed to persist setting.");
            }

            var readBack = Get(key);
            return new QuickerRpcSetSettingResult
            {
                Ok = true,
                Key = key,
                Type = readBack.Type,
                Value = readBack.Value,
                Message = "Setting updated.",
            };
        }
        catch (Exception ex)
        {
            return SetFail(key, ex.InnerException?.Message ?? ex.Message);
        }
    }

    private static bool TryResolveLeaf(
        string key,
        bool forWrite,
        out ParsedSettingKey parsed,
        out object? owner,
        out PropertyInfo? leaf,
        out string? error)
    {
        owner = null;
        leaf = null;
        error = null;
        if (!TryParseKey(key, out parsed, out error))
        {
            return false;
        }

        if (!TryResolveRoot(parsed, forWrite, out var current, out error) || current is null)
        {
            return false;
        }

        var segments = parsed.Path.Split(['.'], StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < segments.Length; i++)
        {
            var property = current.GetType().GetProperty(
                segments[i],
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (property is null || property.GetIndexParameters().Length > 0)
            {
                error = $"Setting path not found: {parsed.Path}";
                return false;
            }

            if (i == segments.Length - 1)
            {
                owner = current;
                leaf = property;
                return true;
            }

            var next = property.GetValue(current);
            if (next is null)
            {
                if (!forWrite || property.SetMethod is null)
                {
                    error = $"Setting path is null: {string.Join(".", segments.Take(i + 1))}";
                    return false;
                }

                next = Activator.CreateInstance(property.PropertyType);
                if (next is null)
                {
                    error = $"Could not create setting path: {string.Join(".", segments.Take(i + 1))}";
                    return false;
                }
                property.SetValue(current, next);
            }

            current = next;
        }

        error = "Setting path is required.";
        return false;
    }

    private static bool TryResolveRoot(
        ParsedSettingKey key,
        bool forWrite,
        out object? root,
        out string? error)
    {
        root = null;
        error = null;
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            error = "Not running inside Quicker.";
            return false;
        }

        if (key.Scope is UserSettingsScope or GlobalSettingsScope)
        {
            var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.IApplicationSettingsService);
            var service = serviceType is null ? null : QuickerV2Runtime.TryGetService(serviceType);
            root = service?.GetType().GetProperty("Settings2", BindingFlags.Public | BindingFlags.Instance)?.GetValue(service);
            error = root is null ? "IApplicationSettingsService.Settings2 unavailable." : null;
            return root is not null;
        }

        if (key.Scope == ExeSettingsScope)
        {
            var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.IExeSettingsService);
            var service = serviceType is null ? null : QuickerV2Runtime.TryGetService(serviceType);
            var get = serviceType?.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(method =>
                    string.Equals(method.Name, "GetExeSettings2", StringComparison.Ordinal)
                    && method.GetParameters().Length == 2);
            root = service is null || get is null ? null : get.Invoke(service, [key.ExeFile, forWrite]);
            error = root is null ? $"ExeSettings2 unavailable: {key.ExeFile}" : null;
            return root is not null;
        }

        error = $"Unsupported V2 settings scope: {key.Scope}";
        return false;
    }

    private static bool Persist(ParsedSettingKey key, out string? error)
    {
        error = null;
        try
        {
            if (key.Scope is UserSettingsScope or GlobalSettingsScope)
            {
                var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.IApplicationSettingsService);
                var service = serviceType is null ? null : QuickerV2Runtime.TryGetService(serviceType);
                var saveAndNotify = serviceType?.GetMethod(
                    "SaveAndNotify",
                    BindingFlags.Public | BindingFlags.Instance,
                    binder: null,
                    types: [typeof(object)],
                    modifiers: null);
                if (service is null || saveAndNotify is null)
                {
                    error = "IApplicationSettingsService.SaveAndNotify unavailable.";
                    return false;
                }

                saveAndNotify.Invoke(service, [null]);
                return true;
            }

            var exeType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.IExeSettingsService);
            var exeService = exeType is null ? null : QuickerV2Runtime.TryGetService(exeType);
            var get = exeType?.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(method => method.Name == "GetExeSettings2" && method.GetParameters().Length == 2);
            var save = exeType?.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(method => method.Name == "SaveExeSettings" && method.GetParameters().Length == 1);
            var settings = exeService is null || get is null ? null : get.Invoke(exeService, [key.ExeFile, false]);
            if (exeService is null || save is null || settings is null)
            {
                error = "IExeSettingsService.SaveExeSettings unavailable.";
                return false;
            }

            save.Invoke(exeService, [settings]);
            return true;
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            error = ex.InnerException.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool TryParseKey(string? key, out ParsedSettingKey parsed, out string? error)
    {
        parsed = default;
        error = null;
        var text = (key ?? string.Empty).Trim();
        var first = text.IndexOf(':');
        if (first <= 0 || first == text.Length - 1)
        {
            error = "key must use scope:path format.";
            return false;
        }

        var scope = text[..first].Trim();
        var remainder = text[(first + 1)..].Trim();
        string? exeFile = null;
        if (string.Equals(scope, ExeSettingsScope, StringComparison.OrdinalIgnoreCase))
        {
            var second = remainder.IndexOf(':');
            if (second <= 0 || second == remainder.Length - 1)
            {
                error = "exeSettings key must use exeSettings:<exeFile>:<propertyPath>.";
                return false;
            }

            exeFile = remainder[..second].Trim();
            remainder = remainder[(second + 1)..].Trim();
            scope = ExeSettingsScope;
        }
        else if (string.Equals(scope, UserSettingsScope, StringComparison.OrdinalIgnoreCase))
        {
            scope = UserSettingsScope;
        }
        else if (string.Equals(scope, GlobalSettingsScope, StringComparison.OrdinalIgnoreCase))
        {
            scope = GlobalSettingsScope;
        }

        parsed = new ParsedSettingKey(scope, remainder, exeFile);
        return true;
    }

    private static IReadOnlyList<QuickerRpcSettingCatalogItem> BuildCatalog()
    {
        var items = new List<QuickerRpcSettingCatalogItem>();
        AppendType(items, QuickerV2Runtime.ResolveType(QuickerV2TypeNames.UserSettings2), UserSettingsScope, string.Empty, 0);
        AppendType(items, QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ExeSettings2), ExeSettingsScope, string.Empty, 0);
        return items;
    }

    private static void AppendType(
        ICollection<QuickerRpcSettingCatalogItem> items,
        Type? type,
        string scope,
        string prefix,
        int depth)
    {
        if (type is null || depth > 3 || items.Count >= 1000)
        {
            return;
        }

        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                     .Where(property => property.GetIndexParameters().Length == 0)
                     .OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var path = prefix.Length == 0 ? property.Name : $"{prefix}.{property.Name}";
            if (IsCatalogLeaf(property.PropertyType) || depth == 3)
            {
                items.Add(new QuickerRpcSettingCatalogItem
                {
                    Key = scope == ExeSettingsScope
                        ? $"{scope}:<exeFile>:{path}"
                        : $"{scope}:{path}",
                    Scope = scope,
                    Path = path,
                    Type = FriendlyTypeName(property.PropertyType),
                    Writable = property.SetMethod is not null,
                    Title = property.Name,
                    Description = scope == ExeSettingsScope
                        ? "Quicker V2 ExeSettings2 property. Replace <exeFile> before use."
                        : "Quicker V2 UserSettings2 property.",
                });
            }
            else
            {
                AppendType(items, Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType, scope, path, depth + 1);
            }
        }
    }

    private static bool IsCatalogLeaf(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        return type.IsPrimitive
               || type.IsEnum
               || type == typeof(string)
               || type == typeof(decimal)
               || type == typeof(DateTime)
               || type == typeof(TimeSpan)
               || typeof(IEnumerable).IsAssignableFrom(type);
    }

    private static object? ConvertValue(string value, Type targetType)
    {
        var nullable = Nullable.GetUnderlyingType(targetType);
        var actual = nullable ?? targetType;
        if (nullable is not null && string.Equals(value.Trim(), "null", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (actual == typeof(string))
        {
            return value;
        }

        if (actual.IsEnum)
        {
            return Enum.Parse(actual, value, ignoreCase: true);
        }

        if (actual == typeof(Guid))
        {
            return Guid.Parse(value);
        }

        if (actual == typeof(TimeSpan))
        {
            return TimeSpan.Parse(value, CultureInfo.InvariantCulture);
        }

        if (actual.IsPrimitive || actual == typeof(decimal) || actual == typeof(DateTime))
        {
            return Convert.ChangeType(value, actual, CultureInfo.InvariantCulture);
        }

        return JsonConvert.DeserializeObject(value, actual);
    }

    private static string? SerializeValue(object? value)
    {
        if (value is null)
        {
            return null;
        }

        var type = value.GetType();
        if (value is string || type.IsPrimitive || value is decimal)
        {
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        if (type.IsEnum)
        {
            return value.ToString();
        }

        return JsonConvert.SerializeObject(value, Formatting.None);
    }

    private static string FriendlyTypeName(Type type) =>
        (Nullable.GetUnderlyingType(type) ?? type).Name;

    private static bool Contains(string? value, string query) =>
        (value ?? string.Empty).Contains(query, StringComparison.OrdinalIgnoreCase);

    private static QuickerRpcSetSettingResult SetFail(string? key, string message) =>
        new() { Ok = false, Key = key ?? string.Empty, Message = message };

    private readonly record struct ParsedSettingKey(string Scope, string Path, string? ExeFile);
}
