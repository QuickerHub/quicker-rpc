using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Validate Quicker Font Awesome icon spec strings (<c>fa:{enumName}</c>[:{#color}]).</summary>
public static class FontAwesomeIconSpecValidator
{
    private static readonly Regex EnumNamePattern = new(
        @"^[A-Za-z][A-Za-z0-9_]*$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex ColorPattern = new(
        @"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>
    /// Validates format. <paramref name="allowEmpty"/> permits whitespace-only / empty (clear icon).
    /// When <paramref name="knownEnumNames"/> is set, the enum segment must be a catalog member.
    /// </summary>
    public static bool TryValidate(
        string? spec,
        bool allowEmpty,
        ICollection<string>? knownEnumNames,
        out string? error)
    {
        error = null;
        if (spec is null)
        {
            if (allowEmpty)
            {
                return true;
            }

            error = "icon is required.";
            return false;
        }

        var trimmed = spec.Trim();
        if (trimmed.Length == 0)
        {
            if (allowEmpty)
            {
                return true;
            }

            error = "icon cannot be empty; omit the field or use \"\" to clear.";
            return false;
        }

        if (!TryParseParts(trimmed, out var enumName, out var color, out error))
        {
            return false;
        }

        if (knownEnumNames is not null && !knownEnumNames.Contains(enumName))
        {
            error =
                $"Unknown icon enum '{enumName}'. Run qkrpc fa search --query <keyword> --json and use a name from names[] (e.g. fa:Light_Flask).";
            return false;
        }

        return true;
    }

    private static bool TryParseParts(
        string trimmed,
        out string enumName,
        out string? color,
        out string? error)
    {
        enumName = string.Empty;
        color = null;
        error = null;

        if (!trimmed.StartsWith("fa:", StringComparison.OrdinalIgnoreCase))
        {
            error =
                "icon must start with 'fa:' (e.g. fa:Light_Flask or fa:Brands_Google). See qkrpc guide get --topic action-icons.";
            return false;
        }

        var body = trimmed.Substring(3);
        if (body.Length == 0)
        {
            error = "icon is missing enum name after 'fa:' (e.g. fa:Light_Flask).";
            return false;
        }

        var colon = body.IndexOf(':');
        if (colon < 0)
        {
            enumName = body;
        }
        else
        {
            enumName = body.Substring(0, colon);
            color = body.Substring(colon + 1);
            if (string.IsNullOrEmpty(enumName))
            {
                error = "icon is missing enum name between 'fa:' and color.";
                return false;
            }

            if (string.IsNullOrEmpty(color))
            {
                error = "icon color segment is empty; use fa:{enumName}:#rrggbb (e.g. fa:Light_Flask:#3b82f6).";
                return false;
            }
        }

        if (!EnumNamePattern.IsMatch(enumName) || enumName.IndexOf('_') < 1)
        {
            error =
                $"icon enum '{enumName}' is invalid; expected Style_Name from fa search names[] (e.g. Light_Flask, Brands_Google).";
            return false;
        }

        if (color is not null && !ColorPattern.IsMatch(color))
        {
            error =
                $"icon color '{color}' is invalid; use #RGB or #RRGGBB (e.g. fa:Light_Flask:#3b82f6).";
            return false;
        }

        return true;
    }
}
