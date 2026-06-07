using System;
using System.Collections.Generic;
using System.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

public sealed class QuickerSettingsUiService
{
    private static readonly IReadOnlyDictionary<string, string> StaticPageAliases =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["settings"] = string.Empty,
            ["config"] = string.Empty,
            ["preferences"] = string.Empty,
            ["设置"] = string.Empty,
            ["偏好设置"] = string.Empty,
            ["general"] = "BasicInfo",
            ["app-settings"] = "AppSettings",
            ["常规"] = "BasicInfo",
            ["常规设置"] = "BasicInfo",
            ["基本选项"] = "BasicInfo",
            ["basic"] = "BasicInfo",
            ["基本信息"] = "BasicInfo",
            ["websocket"] = "AppSettings",
            ["app连接"] = "AppSettings",
            ["recycle-bin"] = "ActionRecycleBinSettingPage",
            ["action-recycle-bin"] = "ActionRecycleBinSettingPage",
            ["动作回收站"] = "ActionRecycleBinSettingPage",
            ["回收站"] = "ActionRecycleBinSettingPage",
            ["search-settings"] = "SearchSettings",
            ["搜索设置"] = "SearchSettings",
            ["ui"] = "UISettingsPage",
            ["ui-settings"] = "UISettingsPage",
            ["界面"] = "UISettingsPage",
            ["界面设置"] = "UISettingsPage",
            ["面板窗口"] = "UISettingsPage",
            ["面板"] = "UISettingsPage",
            ["gestures"] = "GesturesSettingPage",
            ["手势"] = "GesturesSettingPage",
            ["鼠标手势"] = "GesturesSettingPage",
            ["circle-menu"] = "CircleMenuSettingPage",
            ["轮盘菜单"] = "CircleMenuSettingPage",
            ["轮盘"] = "CircleMenuSettingPage",
            ["圆圈菜单"] = "CircleMenuSettingPage",
            ["float"] = "FloatSettings",
            ["悬浮窗"] = "FloatSettings",
            ["blacklist"] = "BlackListSettings",
            ["黑名单"] = "BlackListSettings",
            ["黑名单应用"] = "BlackListSettings",
            ["sync"] = "SyncSettingPage",
            ["同步"] = "SyncSettingPage",
            ["power-keys"] = "PowerKeysSettingsPage",
            ["扩展热键"] = "PowerKeysSettingsPage",
            ["高级按键"] = "PowerKeysSettingsPage",
            ["text-command"] = "TextCommandSettingPage",
            ["文本命令"] = "TextCommandSettingPage",
            ["文本指令"] = "TextCommandSettingPage",
            ["left-button-plus"] = "LeftButtonPlusSettingPage",
            ["左键辅助"] = "LeftButtonPlusSettingPage",
            ["左键增强"] = "LeftButtonPlusSettingPage",
            ["panel-popup"] = "PanelPopupSettings",
            ["弹出面板"] = "PanelPopupSettings",
            ["搜索功能设置"] = "SearchSettings",
            ["about"] = "AboutSettingPage",
            ["关于"] = "AboutSettingPage",
            ["hotkeys"] = "FunctionHotkeys",
            ["功能快捷键"] = "FunctionHotkeys",
            ["action-designer"] = "ActionDesignerSettingsPage",
            ["动作编辑器"] = "ActionDesignerSettingsPage",
            ["context-menu"] = "ContextMenuGeneralSettings",
            ["上下文菜单"] = "ContextMenuGeneralSettings",
            ["auto-run"] = "AutoRunActions",
            ["自动运行"] = "AutoRunActions",
            ["event-trigger"] = "EventTriggerSettingsPage",
            ["事件触发"] = "EventTriggerSettingsPage",
            ["update-actions"] = "UpdateActionsPage",
            ["批量更新动作"] = "UpdateActionsPage",
            ["批量更新"] = "UpdateActionsPage",
        };

    private static readonly Lazy<IReadOnlyDictionary<string, string>> PageAliases =
        new(BuildPageAliases);

    private readonly QuickerSettingsService _settingsService;

    public QuickerSettingsUiService(QuickerSettingsService settingsService) =>
        _settingsService = settingsService;

    public QuickerRpcListSettingsPagesResult ListPages()
    {
        var pages = new List<QuickerRpcSettingsPageInfo>
        {
            new()
            {
                Target = "settings",
                Title = "Quicker 设置",
                Aliases = new List<string> { "settings", "config", "preferences", "设置", "偏好设置" },
                Snippet = "Open main Quicker settings window.",
            },
        };

        pages.AddRange(QuickerSettingsUiAccessor.ListSettingPageIds().Select(pageId => BuildPageInfo(pageId)));

        pages.Add(new QuickerRpcSettingsPageInfo
        {
            Target = "search",
            Title = "搜索窗口",
            Aliases = new List<string> { "search", "search-window", "搜索", "启动搜索" },
            Snippet = "Open Quicker search box (ShowSearchWindow). Optional searchText prefills the query.",
        });

        pages.Add(new QuickerRpcSettingsPageInfo
        {
            Target = "exe-settings",
            Title = "进程/场景设置",
            Aliases = new List<string> { "exe-settings", "process-settings", "进程设置" },
            Snippet = "Open per-exe settings window. Requires exe (e.g. _global).",
        });

        return new QuickerRpcListSettingsPagesResult
        {
            Ok = true,
            Pages = pages,
        };
    }

    public QuickerRpcListSettingsDirectLinksResult ListDirectLinks()
    {
        var links = SettingsDirectLinkCatalog.ListLinks()
            .Select(link => new QuickerRpcSettingsDirectLinkInfo
            {
                Id = link.Id,
                Title = link.Title,
                Target = link.Target,
                Aliases = link.Aliases.ToList(),
                RequiresExe = link.RequiresExe,
                DefaultExe = link.DefaultExe,
            })
            .ToList();

        return new QuickerRpcListSettingsDirectLinksResult
        {
            Ok = true,
            Links = links,
        };
    }

    /// <summary>
    /// Dry-run resolution for agent intent tests (no UI).
    /// </summary>
    public QuickerRpcResolveSettingsIntentResult ResolveIntent(
        string? query = null,
        string? settingKey = null,
        string? preset = null)
    {
        var plan = TryBuildOpenPlan(
            target: null,
            query,
            settingKey,
            exeFile: null,
            searchText: null,
            preset);
        if (plan.Ok)
        {
            return MapPlanToIntentResult(plan);
        }

        var resolvedQuery = (query ?? string.Empty).Trim();
        if (resolvedQuery.Length > 0)
        {
            var headless = TryResolveHeadlessSetting(resolvedQuery);
            if (headless is not null)
            {
                return headless;
            }
        }

        return new QuickerRpcResolveSettingsIntentResult
        {
            Ok = false,
            Intent = "unknown",
            Message = plan.Error ?? "No settings intent matched.",
        };
    }

    /// <summary>
    /// Open Quicker settings UI. Resolve target from preset, setting key, page, or keyword query.
    /// </summary>
    public QuickerRpcOpenSettingsUiResult Open(
        string? target,
        string? query = null,
        string? settingKey = null,
        string? exeFile = null,
        string? searchText = null,
        string? preset = null)
    {
        var plan = TryBuildOpenPlan(target, query, settingKey, exeFile, searchText, preset);
        if (!plan.Ok)
        {
            return Fail(plan.Error ?? "Failed to resolve settings open target.", plan.FailureTarget);
        }

        var result = OpenResolvedTarget(
            plan.Target,
            plan.ExeFile,
            plan.SearchText ?? string.Empty);
        if (result.Ok && plan.PresetId is not null)
        {
            result.PresetId = plan.PresetId;
        }

        return result;
    }

    private sealed class SettingsOpenPlan
    {
        public bool Ok { get; set; }

        public string? Error { get; set; }

        public string? FailureTarget { get; set; }

        public string? PresetId { get; set; }

        public string Target { get; set; } = string.Empty;

        public string? ExeFile { get; set; }

        public string? SearchText { get; set; }

        public string? SettingKey { get; set; }
    }

    private SettingsOpenPlan TryBuildOpenPlan(
        string? target,
        string? query,
        string? settingKey,
        string? exeFile,
        string? searchText,
        string? preset)
    {
        var plan = new SettingsOpenPlan();
        var resolvedTarget = (target ?? string.Empty).Trim();
        var resolvedQuery = (query ?? string.Empty).Trim();
        var resolvedKey = (settingKey ?? string.Empty).Trim();
        var resolvedSearchText = (searchText ?? string.Empty).Trim();
        var resolvedExe = (exeFile ?? string.Empty).Trim();

        if ((preset ?? string.Empty).Trim().Length > 0)
        {
            var presetText = preset!.Trim();
            if (!SettingsDirectLinkCatalog.TryResolve(presetText, out var link))
            {
                plan.Error = $"Unknown settings preset: {presetText}";
                plan.FailureTarget = presetText;
                return plan;
            }

            plan.PresetId = link.Id;
            plan.Target = link.Target;
            if (resolvedExe.Length == 0 && !string.IsNullOrWhiteSpace(link.DefaultExe))
            {
                resolvedExe = link.DefaultExe!;
            }

            if (link.RequiresExe && resolvedExe.Length == 0)
            {
                plan.Error = $"Preset '{link.Id}' requires exe (e.g. --exe _global).";
                plan.FailureTarget = link.Id;
                return plan;
            }
        }
        else if (resolvedKey.Length > 0 && resolvedTarget.Length == 0)
        {
            if (!_settingsService.TryResolvePageForKey(resolvedKey, out var pageId, out var keyError))
            {
                plan.Error = keyError ?? "Failed to resolve page for setting key.";
                plan.FailureTarget = resolvedKey;
                return plan;
            }

            plan.SettingKey = resolvedKey;
            plan.Target = pageId ?? string.Empty;
        }
        else if (resolvedTarget.Length == 0 && resolvedQuery.Length > 0)
        {
            var openByQuery = ResolveTargetFromQuery(resolvedQuery, out var querySearchText);
            if (openByQuery is null)
            {
                plan.Error = $"No settings page matched query: {resolvedQuery}";
                plan.FailureTarget = resolvedQuery;
                return plan;
            }

            plan.Target = openByQuery;
            if (resolvedSearchText.Length == 0 && querySearchText.Length > 0)
            {
                resolvedSearchText = querySearchText;
            }
        }

        if (resolvedTarget.Length > 0)
        {
            plan.Target = resolvedTarget;
        }

        if (plan.Target.Length == 0)
        {
            plan.Target = "settings";
        }

        plan.ExeFile = resolvedExe.Length > 0 ? resolvedExe : null;
        plan.SearchText = resolvedSearchText.Length > 0 ? resolvedSearchText : null;
        plan.Ok = true;
        return plan;
    }

    private QuickerRpcResolveSettingsIntentResult MapPlanToIntentResult(SettingsOpenPlan plan)
    {
        var target = plan.Target.Trim();
        string intent;
        string? pageId = null;
        string? suggestedAction = "open";

        if (IsSearchTarget(target))
        {
            intent = "open-search";
            suggestedAction = "open";
        }
        else if (IsExeSettingsTarget(target))
        {
            intent = "open-exe-settings";
        }
        else
        {
            pageId = ResolvePageId(target);
            intent = pageId is null
                ? "unknown"
                : pageId.Length == 0
                    ? "open-settings"
                    : "open-ui";
        }

        var message = intent switch
        {
            "open-search" => "Open Quicker search window.",
            "open-exe-settings" => "Open per-exe settings window.",
            "open-settings" => "Open main Quicker settings window.",
            "open-ui" => $"Open settings page: {pageId}.",
            _ => "Resolved settings intent.",
        };

        return new QuickerRpcResolveSettingsIntentResult
        {
            Ok = intent != "unknown",
            Intent = intent,
            Target = target,
            PageId = pageId,
            PresetId = plan.PresetId,
            SettingKey = plan.SettingKey,
            SearchText = plan.SearchText,
            SuggestedAction = suggestedAction,
            Message = message,
        };
    }

    private QuickerRpcResolveSettingsIntentResult? TryResolveHeadlessSetting(string query)
    {
        var search = _settingsService.Search(query, 5);
        if (search.Items.Count == 0 || search.Pages.Count > 0)
        {
            return null;
        }

        var top = search.Items[0];
        if (string.IsNullOrWhiteSpace(top.Key))
        {
            return null;
        }

        return new QuickerRpcResolveSettingsIntentResult
        {
            Ok = true,
            Intent = "headless-setting",
            Target = top.Key,
            SettingKey = top.Key,
            PageId = top.PageId,
            SuggestedAction = "get",
            Message = $"Headless setting match: {top.Key}.",
        };
    }

    private string? ResolveTargetFromQuery(string query, out string searchText)
    {
        searchText = string.Empty;
        if (SettingsDirectLinkCatalog.TryResolve(query, out var link))
        {
            return link.Target;
        }

        if (IsSearchWindowIntent(query))
        {
            searchText = ExtractSearchPrefill(query);
            return "search";
        }

        var normalizedQuery = NormalizeSettingsQuery(query);
        if (normalizedQuery.Length > 0)
        {
            if (PageAliases.Value.TryGetValue(normalizedQuery, out var aliasPageId))
            {
                return aliasPageId;
            }

            if (SettingsDirectLinkCatalog.TryResolve(normalizedQuery, out var normalizedLink))
            {
                return normalizedLink.Target;
            }
        }

        var search = _settingsService.Search(normalizedQuery, 5);
        if (search.Pages.Count == 0
            && !string.Equals(normalizedQuery, query, StringComparison.Ordinal))
        {
            search = _settingsService.Search(query, 5);
        }
        if (search.Pages.Count > 0)
        {
            return search.Pages[0].PageId;
        }

        var itemWithPage = search.Items.FirstOrDefault(item => !string.IsNullOrWhiteSpace(item.PageId));
        if (itemWithPage?.PageId is { Length: > 0 } pageId)
        {
            return pageId;
        }

        return null;
    }

    private static string ExtractSearchPrefill(string query)
    {
        var trimmed = query.Trim();
        foreach (var prefix in new[] { "打开 Quicker 搜索", "打开quicker搜索", "打开搜索", "启动搜索" })
        {
            if (trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                var rest = trimmed.Substring(prefix.Length).Trim();
                return rest.Length > 0 ? rest : string.Empty;
            }
        }

        return string.Empty;
    }

    private static bool IsSearchWindowIntent(string query)
    {
        if (query.Length == 0)
        {
            return false;
        }

        if (query.Contains("搜索设置", StringComparison.OrdinalIgnoreCase)
            || query.Contains("search-settings", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.Equals(query, "search", StringComparison.OrdinalIgnoreCase)
            || string.Equals(query, "搜索", StringComparison.OrdinalIgnoreCase)
            || string.Equals(query, "启动搜索", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if ((query.Contains("打开", StringComparison.OrdinalIgnoreCase)
             || query.Contains("启动", StringComparison.OrdinalIgnoreCase))
            && query.Contains("搜索", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static string NormalizeSettingsQuery(string query)
    {
        var text = (query ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return text;
        }

        foreach (var prefix in new[]
                 {
                     "请帮我", "帮我", "请", "我想", "想要", "能不能", "可以",
                 })
        {
            if (text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                text = text.Substring(prefix.Length).Trim();
            }
        }

        foreach (var verb in new[]
                 {
                     "打开一下", "打开", "跳转", "进入", "去看看", "找一下",
                 })
        {
            if (text.StartsWith(verb, StringComparison.OrdinalIgnoreCase))
            {
                text = text.Substring(verb.Length).Trim();
            }
        }

        foreach (var suffix in new[]
                 {
                     "设置页面", "设置页", "设置", "页面", "界面", "在哪里", "在哪",
                 })
        {
            if (text.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)
                && text.Length > suffix.Length)
            {
                text = text.Substring(0, text.Length - suffix.Length).Trim();
            }
        }

        return text.Length > 0 ? text : query.Trim();
    }

    private QuickerRpcOpenSettingsUiResult OpenResolvedTarget(
        string target,
        string? exeFile,
        string searchText)
    {
        var text = target.Trim();
        try
        {
            if (IsSearchTarget(text))
            {
                var prefill = searchText.Length > 0 ? searchText : null;
                if (QuickerSettingsUiAccessor.TryOpenSearchWindow(prefill, out var searchError))
                {
                    return Success("search", null, prefill is null
                        ? "Quicker 搜索窗口已打开。"
                        : $"Quicker 搜索窗口已打开（预填：{prefill}）。");
                }

                return Fail(searchError ?? "Failed to open search window.", "search");
            }

            if (IsExeSettingsTarget(text))
            {
                if (QuickerSettingsUiAccessor.TryOpenExeSettingsWindow(exeFile ?? string.Empty, out var exeError))
                {
                    return Success("exe-settings", null, "进程设置窗口已打开。");
                }

                return Fail(exeError ?? "Failed to open exe settings window.", "exe-settings");
            }

            var pageId = ResolvePageId(text);
            if (pageId is null)
            {
                return Fail($"Unknown open target: {text}", text);
            }

            if (pageId.Length == 0)
            {
                if (QuickerSettingsUiAccessor.TryOpenConfigWindow(out var configError)
                    || QuickerSettingsUiAccessor.TryOpenSettingsPage(null, out _, out configError))
                {
                    return Success("settings", null, "Quicker 设置窗口已打开。");
                }

                return Fail(configError ?? "Failed to open settings window.", "settings");
            }

            if (QuickerSettingsUiAccessor.TryOpenSettingsPage(pageId, out var resolvedPageId, out var pageError))
            {
                return Success(resolvedPageId ?? pageId, resolvedPageId ?? pageId, $"已打开设置页：{resolvedPageId ?? pageId}");
            }

            return Fail(pageError ?? "Failed to open settings page.", pageId);
        }
        catch (Exception ex)
        {
            return Fail(ex.Message, text);
        }
    }

    private static QuickerRpcSettingsPageInfo BuildPageInfo(string pageId)
    {
        var info = new QuickerRpcSettingsPageInfo
        {
            PageId = pageId,
            Target = pageId,
            Aliases = PageAliases.Value
                .Where(pair => string.Equals(pair.Value, pageId, StringComparison.OrdinalIgnoreCase))
                .Select(pair => pair.Key)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
        };

        if (QuickerSettingsAgentKeywordCatalog.TryGet("page:" + pageId, out var meta))
        {
            info.Title = meta.Title;
            info.Snippet = meta.Snippet;
            if (meta.Keywords.Count > 0)
            {
                info.Keywords = string.Join(", ", meta.Keywords);
            }

            if (meta.OpenAliases.Count > 0)
            {
                info.Aliases = info.Aliases
                    .Concat(meta.OpenAliases)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }
        }

        return info;
    }

    private static string? ResolvePageId(string target)
    {
        if (PageAliases.Value.TryGetValue(target, out var alias))
        {
            return alias;
        }

        if (QuickerSettingsUiAccessor.TryParseSettingPageId(target, out var pageId, out _))
        {
            return pageId;
        }

        return null;
    }

    private static IReadOnlyDictionary<string, string> BuildPageAliases()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in StaticPageAliases)
        {
            map[pair.Key] = pair.Value;
        }

        foreach (var pair in QuickerSettingsAgentKeywordCatalog.All)
        {
            if (!pair.Key.StartsWith("page:", StringComparison.Ordinal)
                || !string.Equals(pair.Value.Kind, "page", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var pageId = pair.Value.PageId ?? pair.Key.Substring("page:".Length);
            if (pageId.Length == 0)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(pair.Value.Title))
            {
                var title = pair.Value.Title.Trim();
                if (!map.ContainsKey(title))
                {
                    map[title] = pageId;
                }
            }

            foreach (var alias in pair.Value.OpenAliases)
            {
                var trimmed = (alias ?? string.Empty).Trim();
                if (trimmed.Length > 0 && !map.ContainsKey(trimmed))
                {
                    map[trimmed] = pageId;
                }
            }
        }

        return map;
    }

    private static bool IsSearchTarget(string target) =>
        string.Equals(target, "search", StringComparison.OrdinalIgnoreCase)
        || string.Equals(target, "search-window", StringComparison.OrdinalIgnoreCase)
        || string.Equals(target, "搜索", StringComparison.OrdinalIgnoreCase)
        || string.Equals(target, "启动搜索", StringComparison.OrdinalIgnoreCase);

    private static bool IsExeSettingsTarget(string target) =>
        string.Equals(target, "exe-settings", StringComparison.OrdinalIgnoreCase)
        || string.Equals(target, "process-settings", StringComparison.OrdinalIgnoreCase)
        || string.Equals(target, "进程设置", StringComparison.OrdinalIgnoreCase);

    private static QuickerRpcOpenSettingsUiResult Success(string target, string? pageId, string message) =>
        new()
        {
            Ok = true,
            Target = target,
            PageId = pageId,
            Message = message,
        };

    private static QuickerRpcOpenSettingsUiResult Fail(string message, string? target = null) =>
        new()
        {
            Ok = false,
            Target = target ?? string.Empty,
            Message = message,
        };
}
