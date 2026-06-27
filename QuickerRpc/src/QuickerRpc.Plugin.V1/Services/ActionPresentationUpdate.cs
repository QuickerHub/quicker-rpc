using Quicker.Common;

using QuickerRpc.AgentModel.Core;

namespace QuickerRpc.Plugin.Services;

/// <summary>Apply title / description / icon / context menu on <see cref="ActionItem"/> (null field = omit).</summary>
internal static class ActionPresentationUpdate
{
    public const int MaxContextMenuDataLength = 1500;

    public static bool TryApply(
        ActionItem action,
        string? title,
        string? description,
        string? icon,
        string? contextMenuData,
        out string? error)
    {
        error = null;
        var changed = false;

        if (title is not null)
        {
            var trimmed = title.Trim();
            if (trimmed.Length == 0)
            {
                error = "title cannot be empty.";
                return false;
            }

            action.Title = trimmed;
            changed = true;
        }

        if (description is not null)
        {
            action.Description = description;
            changed = true;
        }

        if (icon is not null)
        {
            if (!FontAwesomeIconValidation.TryValidate(icon, allowEmpty: true, out error))
            {
                return false;
            }

            action.Icon = icon.Trim();
            changed = true;
        }

        if (contextMenuData is not null)
        {
            if (contextMenuData.Length > MaxContextMenuDataLength)
            {
                error = $"contextMenuData exceeds max length ({MaxContextMenuDataLength}).";
                return false;
            }

            action.ContextMenuData = contextMenuData;
            changed = true;
        }

        if (!changed)
        {
            error = "At least one of title, description, icon, or contextMenuData must be provided.";
            return false;
        }

        return true;
    }

    public static string? ReadOptionalPatchString(Newtonsoft.Json.Linq.JToken? token)
    {
        if (token is null)
        {
            return null;
        }

        return token.Type switch
        {
            Newtonsoft.Json.Linq.JTokenType.Null => string.Empty,
            Newtonsoft.Json.Linq.JTokenType.String => token.ToString(),
            _ => JTokenCompat.Compact(token),
        };
    }
}
