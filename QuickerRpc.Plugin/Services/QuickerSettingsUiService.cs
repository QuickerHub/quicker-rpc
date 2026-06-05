using System;
using System.Collections.Generic;
using System.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

public sealed class QuickerSettingsUiService
{
    private static readonly IReadOnlyDictionary<string, string> PageAliases =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["settings"] = string.Empty,
            ["config"] = string.Empty,
            ["preferences"] = string.Empty,
            ["设置"] = string.Empty,
            ["偏好设置"] = string.Empty,
            ["general"] = "AppSettings",
            ["app-settings"] = "AppSettings",
            ["常规"] = "AppSettings",
            ["常规设置"] = "AppSettings",
            ["基本选项"] = "AppSettings",
            ["basic"] = "BasicInfo",
            ["基本信息"] = "BasicInfo",
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
            ["gestures"] = "GesturesSettingPage",
            ["手势"] = "GesturesSettingPage",
            ["circle-menu"] = "CircleMenuSettingPage",
            ["圆圈菜单"] = "CircleMenuSettingPage",
            ["float"] = "FloatSettings",
            ["悬浮窗"] = "FloatSettings",
            ["blacklist"] = "BlackListSettings",
            ["黑名单"] = "BlackListSettings",
            ["sync"] = "SyncSettingPage",
            ["同步"] = "SyncSettingPage",
            ["power-keys"] = "PowerKeysSettingsPage",
            ["高级按键"] = "PowerKeysSettingsPage",
            ["text-command"] = "TextCommandSettingPage",
            ["文本命令"] = "TextCommandSettingPage",
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
        };

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
            Snippet = "Open Quicker search box (ShowSearchWindow).",
        });

        return new QuickerRpcListSettingsPagesResult
        {
            Ok = true,
            Pages = pages,
        };
    }

    public QuickerRpcOpenSettingsUiResult Open(string target, string? exeFile = null)
    {
        var text = (target ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            text = "settings";
        }

        try
        {
            if (IsSearchTarget(text))
            {
                if (QuickerSettingsUiAccessor.TryOpenSearchWindow(null, out var searchError))
                {
                    return Success("search", null, "Quicker 搜索窗口已打开。");
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
            Aliases = PageAliases
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
        if (PageAliases.TryGetValue(target, out var alias))
        {
            return alias;
        }

        if (QuickerSettingsUiAccessor.TryParseSettingPageId(target, out var pageId, out _))
        {
            return pageId;
        }

        return null;
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
