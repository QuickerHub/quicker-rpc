using Quicker.Common;

namespace QuickerRpc.Plugin.Services;

/// <summary>Apply title / description / icon on <see cref="ActionItem"/> (null field = omit).</summary>
internal static class ActionPresentationUpdate
{
    public static bool TryApply(
        ActionItem action,
        string? title,
        string? description,
        string? icon,
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

        if (!changed)
        {
            error = "At least one of title, description, or icon must be provided.";
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
            _ => token.ToString(Newtonsoft.Json.Formatting.None),
        };
    }
}
