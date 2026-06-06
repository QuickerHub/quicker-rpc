using System;
using System.Collections.Generic;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parses sort shorthand like <c>lastEdit.desc</c>, <c>title.asc</c>, <c>action.ExeFile</c>.
/// Unrecognized strings remain Z.Expressions scripts.
/// </summary>
internal static class ActionSearchSortShorthand
{
    private sealed class FieldSpec
    {
        public FieldSpec(string script, bool defaultDescending)
        {
            Script = script;
            DefaultDescending = defaultDescending;
        }

        public string Script { get; }

        public bool DefaultDescending { get; }
    }

    private static readonly Dictionary<string, FieldSpec> BuiltInFields =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["lastedit"] = new("action.EditMs", defaultDescending: true),
            ["last-edit"] = new("action.EditMs", defaultDescending: true),
            ["edit"] = new("action.EditMs", defaultDescending: true),
            ["recent"] = new("action.EditMs", defaultDescending: true),
            ["editms"] = new("action.EditMs", defaultDescending: true),
            ["title"] = new("action.Title", defaultDescending: false),
            ["name"] = new("action.Title", defaultDescending: false),
            ["relevance"] = new("action.Score", defaultDescending: true),
            ["score"] = new("action.Score", defaultDescending: true),
            ["source"] = new("action.Source", defaultDescending: false),
            ["exefile"] = new("action.ExeFile", defaultDescending: false),
            ["exe"] = new("action.ExeFile", defaultDescending: false),
            ["profilename"] = new("action.ProfileName", defaultDescending: false),
            ["profile"] = new("action.ProfileName", defaultDescending: false),
            ["profileid"] = new("action.ProfileId", defaultDescending: false),
            ["actionid"] = new("action.ActionId", defaultDescending: false),
            ["id"] = new("action.ActionId", defaultDescending: false),
            ["templateid"] = new("action.TemplateId", defaultDescending: false),
            ["sharedactionid"] = new("action.SharedActionId", defaultDescending: false),
            ["sharedid"] = new("action.SharedActionId", defaultDescending: false),
            ["description"] = new("action.Description", defaultDescending: false),
            ["icon"] = new("action.Icon", defaultDescending: false),
            ["usetemplate"] = new("action.UseTemplate", defaultDescending: false),
        };

    public static bool TryParse(string? text, out ActionSearchSortRule rule)
    {
        rule = null!;
        var raw = (text ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return false;
        }

        string fieldPart;
        bool? descendingOverride = null;

        var lastDot = raw.LastIndexOf('.');
        if (lastDot > 0 && lastDot < raw.Length - 1)
        {
            var suffix = raw.Substring(lastDot + 1).Trim();
            if (TryParseDirection(suffix, out var descending))
            {
                fieldPart = raw.Substring(0, lastDot).Trim();
                descendingOverride = descending;
            }
            else
            {
                fieldPart = raw;
            }
        }
        else
        {
            fieldPart = raw;
        }

        if (!TryResolveFieldScript(fieldPart, out var script, out var defaultDescending))
        {
            return false;
        }

        rule = new ActionSearchSortRule(script, descendingOverride ?? defaultDescending);
        return true;
    }

    private static bool TryParseDirection(string suffix, out bool descending)
    {
        descending = false;
        switch (suffix.Trim().ToLowerInvariant())
        {
            case "desc":
            case "descending":
                descending = true;
                return true;
            case "asc":
            case "ascending":
                descending = false;
                return true;
            default:
                return false;
        }
    }

    private static bool TryResolveFieldScript(string fieldPart, out string script, out bool defaultDescending)
    {
        script = string.Empty;
        defaultDescending = false;
        if (fieldPart.Length == 0)
        {
            return false;
        }

        if (fieldPart.StartsWith("action.", StringComparison.OrdinalIgnoreCase))
        {
            script = fieldPart;
            defaultDescending = false;
            return true;
        }

        if (BuiltInFields.TryGetValue(fieldPart, out var builtIn))
        {
            script = builtIn.Script;
            defaultDescending = builtIn.DefaultDescending;
            return true;
        }

        return false;
    }
}
