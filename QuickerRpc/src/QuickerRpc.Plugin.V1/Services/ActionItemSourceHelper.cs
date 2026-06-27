using System;
using Quicker.Common;

namespace QuickerRpc.Plugin.Services;

internal enum ActionInstallSourceKind
{
    Local,
    Library,
    Published,
}

internal static class ActionItemSourceHelper
{
    public static bool IsFromActionLibrary(ActionItem action)
    {
        if (action is null)
        {
            return false;
        }

        if (action.UseTemplate)
        {
            return true;
        }

        return TryParseGuid(action.TemplateId, out _);
    }

    public static bool IsPublishedSharedAction(ActionItem action)
    {
        if (action is null)
        {
            return false;
        }

        return TryParseGuid(action.SharedActionId, out _);
    }

    public static bool IsLocalOnly(ActionItem action) =>
        !IsFromActionLibrary(action) && !IsPublishedSharedAction(action);

    public static ActionInstallSourceKind ResolveKind(ActionItem action)
    {
        if (IsFromActionLibrary(action))
        {
            return ActionInstallSourceKind.Library;
        }

        if (IsPublishedSharedAction(action))
        {
            return ActionInstallSourceKind.Published;
        }

        return ActionInstallSourceKind.Local;
    }

    public static string ResolveKindToken(ActionItem action) =>
        ResolveKind(action) switch
        {
            ActionInstallSourceKind.Library => "library",
            ActionInstallSourceKind.Published => "published",
            _ => "local",
        };

    public static string? GetTemplateId(ActionItem action)
    {
        if (action is null || !TryParseGuid(action.TemplateId, out var id))
        {
            return null;
        }

        return id.ToString("D");
    }

    public static string? GetSharedActionId(ActionItem action)
    {
        if (action is null || !TryParseGuid(action.SharedActionId, out var id))
        {
            return null;
        }

        return id.ToString("D");
    }

    public static bool MatchesSharedId(ActionItem action, string sharedId)
    {
        var key = (sharedId ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return false;
        }

        if (TryParseGuid(action.TemplateId, out var templateId)
            && string.Equals(templateId.ToString("D"), key, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (TryParseGuid(action.SharedActionId, out var publishedId)
            && string.Equals(publishedId.ToString("D"), key, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    public static bool MatchesSourceFilter(ActionItem action, ActionSourceFilter filter)
    {
        return filter.Kind switch
        {
            ActionSourceFilterKind.Library => IsFromActionLibrary(action),
            ActionSourceFilterKind.Local => IsLocalOnly(action),
            ActionSourceFilterKind.Published => IsPublishedSharedAction(action),
            ActionSourceFilterKind.SharedId => MatchesSharedId(action, filter.SharedId ?? string.Empty),
            _ => true,
        };
    }

    private static bool TryParseGuid(string? value, out Guid guid)
    {
        guid = Guid.Empty;
        var text = (value ?? string.Empty).Trim();
        return text.Length > 0 && Guid.TryParse(text, out guid) && guid != Guid.Empty;
    }
}
