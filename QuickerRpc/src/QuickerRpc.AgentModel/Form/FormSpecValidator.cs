using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Validates <see cref="FormSpecDocument"/> (qkrpc.form.v1).</summary>
public static class FormSpecValidator
{
    private const int MaxFieldKeyLength = 64;

    private static readonly HashSet<string> AllowedModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "variables",
        "dict_dynamic",
    };

    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text",
        "textarea",
        "number",
        "integer",
        "boolean",
        "select",
        "dateTime",
        "password",
    };

    public static FormSpecValidationResult Validate(FormSpecDocument? spec) =>
        Validate(spec, definedVariableKeys: null);

    /// <summary>
    /// When <paramref name="definedVariableKeys"/> is provided, each field target (variables mode)
    /// or dictVar (dict_dynamic mode) must match a defined action variable key.
    /// </summary>
    public static FormSpecValidationResult Validate(
        FormSpecDocument? spec,
        IReadOnlyCollection<string>? definedVariableKeys)
    {
        var issues = new List<FormSpecIssue>();
        if (spec is null)
        {
            issues.Add(Issue("", "Form spec document is required."));
            return Fail(issues);
        }

        if (!string.IsNullOrWhiteSpace(spec.Schema)
            && !string.Equals(spec.Schema.Trim(), FormSpecDocument.SchemaId, StringComparison.Ordinal))
        {
            issues.Add(Issue("$schema", "Unsupported schema. Expected qkrpc.form.v1."));
        }

        var mode = (spec.Mode ?? string.Empty).Trim();
        if (mode.Length == 0)
        {
            issues.Add(Issue("mode", "mode is required (variables | dict_dynamic)."));
        }
        else if (!AllowedModes.Contains(mode))
        {
            issues.Add(Issue("mode", "mode must be variables or dict_dynamic."));
        }

        if (string.IsNullOrWhiteSpace(spec.Title))
        {
            issues.Add(Issue("title", "title is required."));
        }
        else if (spec.Title.Trim().Length > 120)
        {
            issues.Add(Issue("title", "title must be at most 120 characters."));
        }

        var variableKeys = ToVariableKeySet(definedVariableKeys);

        if (string.Equals(mode, "dict_dynamic", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(spec.DictVar))
        {
            issues.Add(Issue("dictVar", "dictVar is required when mode is dict_dynamic."));
        }
        else if (variableKeys is not null
                 && string.Equals(mode, "dict_dynamic", StringComparison.OrdinalIgnoreCase)
                 && !string.IsNullOrWhiteSpace(spec.DictVar)
                 && !variableKeys.Contains(spec.DictVar.Trim()))
        {
            issues.Add(Issue("dictVar", "Variable not defined in action: " + spec.DictVar.Trim() + "."));
        }

        if (spec.Fields is null || spec.Fields.Count == 0)
        {
            issues.Add(Issue("fields", "At least one field is required."));
            return Fail(issues);
        }

        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var validateTargets = variableKeys is not null
                              && string.Equals(mode, "variables", StringComparison.OrdinalIgnoreCase);
        for (var i = 0; i < spec.Fields.Count; i++)
        {
            ValidateField(
                spec.Fields[i],
                $"fields[{i}]",
                issues,
                seenKeys,
                spec.Fields,
                validateTargets,
                variableKeys);
        }

        return issues.Count == 0 ? new FormSpecValidationResult { Success = true } : Fail(issues);
    }

    private static void ValidateField(
        FormSpecField? field,
        string path,
        List<FormSpecIssue> issues,
        HashSet<string> seenKeys,
        IList<FormSpecField> allFields,
        bool validateTargets,
        HashSet<string>? variableKeys)
    {
        if (field is null)
        {
            issues.Add(Issue(path, "Field object is required."));
            return;
        }

        var key = (field.Key ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            issues.Add(Issue($"{path}.key", "key is required."));
        }
        else if (key.Length > MaxFieldKeyLength)
        {
            issues.Add(Issue($"{path}.key", $"key must be at most {MaxFieldKeyLength} characters."));
        }
        else if (!seenKeys.Add(key))
        {
            issues.Add(Issue($"{path}.key", "Duplicate field key: " + key + "."));
        }

        var target = (field.Target ?? key).Trim();
        if (target.Length == 0)
        {
            issues.Add(Issue($"{path}.target", "target is required when key is empty."));
        }
        else if (validateTargets && variableKeys is not null && !variableKeys.Contains(target))
        {
            issues.Add(Issue($"{path}.target", "Variable not defined in action: " + target + "."));
        }

        var label = (field.Label ?? string.Empty).Trim();
        if (label.Length == 0)
        {
            issues.Add(Issue($"{path}.label", "label is required."));
        }
        else if (label.Length > 80)
        {
            issues.Add(Issue($"{path}.label", "label must be at most 80 characters."));
        }

        var type = (field.Type ?? string.Empty).Trim();
        if (type.Length == 0)
        {
            issues.Add(Issue($"{path}.type", "type is required."));
        }
        else if (!AllowedTypes.Contains(type))
        {
            issues.Add(Issue($"{path}.type", "Unsupported type. Allowed: " + string.Join(", ", AllowedTypes.OrderBy(x => x)) + "."));
        }

        if (string.Equals(type, "select", StringComparison.OrdinalIgnoreCase))
        {
            if (field.Options is null || field.Options.Count == 0)
            {
                issues.Add(Issue($"{path}.options", "select fields require at least one option."));
            }
            else
            {
                var seenValues = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < field.Options.Count; i++)
                {
                    ValidateSelectOption(field.Options[i], $"{path}.options[{i}]", issues, seenValues);
                }
            }
        }
        else if (field.Options is { Count: > 0 })
        {
            issues.Add(Issue($"{path}.options", "options are only allowed for select fields."));
        }

        if (field.Min is not null || field.Max is not null)
        {
            if (!IsNumericType(type))
            {
                issues.Add(Issue($"{path}.min", "min/max are only allowed for number or integer fields."));
            }
            else if (field.Min is not null && field.Max is not null && field.Min.Value > field.Max.Value)
            {
                issues.Add(Issue($"{path}.max", "max must be greater than or equal to min."));
            }
        }

        if (!string.IsNullOrWhiteSpace(field.Pattern))
        {
            if (!IsTextLikeType(type))
            {
                issues.Add(Issue($"{path}.pattern", "pattern is only allowed for text-like fields."));
            }
            else
            {
                try
                {
                    _ = new Regex(field.Pattern);
                }
                catch (Exception ex)
                {
                    issues.Add(Issue($"{path}.pattern", "Invalid regular expression: " + ex.Message));
                }
            }
        }

        if (field.Default is not null)
        {
            ValidateDefault(field, path, issues);
        }

        if (field.VisibleWhen is not null)
        {
            ValidateVisibleWhen(field.VisibleWhen, path, issues, allFields, key);
        }
    }

    private static void ValidateSelectOption(
        FormSpecSelectOption? option,
        string path,
        List<FormSpecIssue> issues,
        HashSet<string> seenValues)
    {
        if (option is null)
        {
            issues.Add(Issue(path, "Option object is required."));
            return;
        }

        var value = (option.Value ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            issues.Add(Issue($"{path}.value", "value is required."));
        }
        else if (!seenValues.Add(value))
        {
            issues.Add(Issue($"{path}.value", "Duplicate option value: " + value + "."));
        }

        if (string.IsNullOrWhiteSpace(option.Label))
        {
            issues.Add(Issue($"{path}.label", "label is required."));
        }
    }

    private static void ValidateDefault(FormSpecField field, string path, List<FormSpecIssue> issues)
    {
        var type = (field.Type ?? string.Empty).Trim();
        var def = field.Default ?? string.Empty;

        if (string.Equals(type, "boolean", StringComparison.OrdinalIgnoreCase))
        {
            if (!bool.TryParse(def, out _))
            {
                issues.Add(Issue($"{path}.default", "boolean default must be true or false."));
            }

            return;
        }

        if (IsNumericType(type))
        {
            if (!double.TryParse(def, NumberStyles.Float, CultureInfo.InvariantCulture, out var num))
            {
                issues.Add(Issue($"{path}.default", "numeric default must be a number."));
                return;
            }

            if (string.Equals(type, "integer", StringComparison.OrdinalIgnoreCase)
                && !IsInteger(num))
            {
                issues.Add(Issue($"{path}.default", "integer default must be a whole number."));
            }

            if (field.Min is not null && num < field.Min.Value)
            {
                issues.Add(Issue($"{path}.default", "default is below min."));
            }

            if (field.Max is not null && num > field.Max.Value)
            {
                issues.Add(Issue($"{path}.default", "default is above max."));
            }

            return;
        }

        if (string.Equals(type, "select", StringComparison.OrdinalIgnoreCase)
            && field.Options is { Count: > 0 })
        {
            var allowed = new HashSet<string>(
                field.Options
                    .Select(o => (o.Value ?? string.Empty).Trim())
                    .Where(v => v.Length > 0),
                StringComparer.OrdinalIgnoreCase);
            if (!allowed.Contains(def.Trim()))
            {
                issues.Add(Issue($"{path}.default", "default must match one of the select option values."));
            }
        }
    }

    private static void ValidateVisibleWhen(
        FormSpecVisibleWhen visibleWhen,
        string path,
        List<FormSpecIssue> issues,
        IList<FormSpecField> allFields,
        string currentKey)
    {
        var refField = (visibleWhen.Field ?? string.Empty).Trim();
        if (refField.Length == 0)
        {
            issues.Add(Issue($"{path}.visibleWhen.field", "field is required."));
            return;
        }

        if (string.Equals(refField, currentKey, StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(Issue($"{path}.visibleWhen.field", "field cannot reference itself."));
        }

        if (!allFields.Any(f => string.Equals((f.Key ?? string.Empty).Trim(), refField, StringComparison.OrdinalIgnoreCase)))
        {
            issues.Add(Issue($"{path}.visibleWhen.field", "Unknown field: " + refField + "."));
        }

        var hasEq = !string.IsNullOrWhiteSpace(visibleWhen.Eq);
        var hasNe = !string.IsNullOrWhiteSpace(visibleWhen.Ne);
        if (hasEq == hasNe)
        {
            issues.Add(Issue($"{path}.visibleWhen", "Provide exactly one of eq or ne."));
        }
    }

    private static HashSet<string>? ToVariableKeySet(IReadOnlyCollection<string>? definedVariableKeys)
    {
        if (definedVariableKeys is null || definedVariableKeys.Count == 0)
        {
            return null;
        }

        return new HashSet<string>(definedVariableKeys, StringComparer.OrdinalIgnoreCase);
    }

    private static bool IsNumericType(string type) =>
        string.Equals(type, "number", StringComparison.OrdinalIgnoreCase)
        || string.Equals(type, "integer", StringComparison.OrdinalIgnoreCase);

    private static bool IsTextLikeType(string type) =>
        string.Equals(type, "text", StringComparison.OrdinalIgnoreCase)
        || string.Equals(type, "textarea", StringComparison.OrdinalIgnoreCase)
        || string.Equals(type, "password", StringComparison.OrdinalIgnoreCase);

    private static bool IsInteger(double value) =>
        Math.Abs(value - Math.Truncate(value)) < 0.0000001;

    private static FormSpecIssue Issue(string path, string message) =>
        new() { Path = path, Message = message };

    private static FormSpecValidationResult Fail(List<FormSpecIssue> issues) =>
        new() { Success = false, Issues = issues };
}
