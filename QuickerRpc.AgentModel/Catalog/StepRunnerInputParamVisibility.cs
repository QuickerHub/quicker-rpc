using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Resolves which StepRunner input/output params are visible for a control-field value.</summary>
public static class StepRunnerInputParamVisibility
{
    private static readonly Regex EqualityExpression = new(
        @"^\s*(?<key>[A-Za-z_][\w]*)\s*==\s*(?:'(?<value>[^']*)'|""(?<value>[^""]*)""|(?<value>[^'""\s]+))\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static bool RunnerHasInputVisibilityRules(StepRunnerDefinition runner) =>
        runner.InputParamDefs.Any(p => !p.IsControlField && ParamHasVisibilityRules(p));

    public static bool OutputParamHasVisibilityRules(StepRunnerOutputParamDef param) =>
        param.ValidForValues.Count > 0
        || param.InvalidForValues.Count > 0
        || !string.IsNullOrWhiteSpace(param.VisibleExpression);

    public static bool RunnerHasOutputVisibilityRules(StepRunnerDefinition runner) =>
        runner.OutputParamDefs.Any(OutputParamHasVisibilityRules);

    public static bool RunnerHasVisibilityRules(StepRunnerDefinition runner) =>
        RunnerHasInputVisibilityRules(runner) || RunnerHasOutputVisibilityRules(runner);

    public static bool ParamHasVisibilityRules(StepRunnerInputParamDef param) =>
        param.ValidForValues.Count > 0
        || param.InvalidForValues.Count > 0
        || !string.IsNullOrWhiteSpace(param.VisibleExpression);

    public static bool IsInputVisible(
        StepRunnerInputParamDef param,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        if (param.IsControlField)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(controlFieldValue))
        {
            return true;
        }

        if (!ParamHasVisibilityRules(param))
        {
            return true;
        }

        return IsVisibleForControlValue(
            param.ValidForValues,
            param.InvalidForValues,
            param.VisibleExpression,
            controlFieldKey,
            controlFieldValue.Trim());
    }

    public static bool IsOutputVisible(
        StepRunnerOutputParamDef param,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        if (string.IsNullOrWhiteSpace(controlFieldValue))
        {
            return true;
        }

        if (!OutputParamHasVisibilityRules(param))
        {
            return true;
        }

        return IsVisibleForControlValue(
            param.ValidForValues,
            param.InvalidForValues,
            param.VisibleExpression,
            controlFieldKey,
            controlFieldValue.Trim());
    }

    public static StepRunnerInputParamDef? TryFindControlField(IList<StepRunnerInputParamDef> inputDefs)
    {
        foreach (var p in inputDefs)
        {
            if (p.IsControlField && p.VarType == 9 && p.SelectionItems.Count > 0)
            {
                return p;
            }
        }

        return null;
    }

    public static bool IsValidControlValue(StepRunnerInputParamDef control, string controlFieldValue)
    {
        var value = (controlFieldValue ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return false;
        }

        return control.SelectionItems.Any(si =>
            string.Equals((si.Value ?? string.Empty).Trim(), value, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Input keys visible for the given control-field value (includes control key when visible).</summary>
    public static List<string> ResolveVisibleInputKeys(
        IList<StepRunnerInputParamDef> inputDefs,
        string? controlFieldKey,
        string controlFieldValue)
    {
        var value = (controlFieldValue ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return new List<string>();
        }

        var keys = new List<string>();
        foreach (var p in inputDefs)
        {
            var key = (p.Key ?? string.Empty).Trim();
            if (key.Length == 0)
            {
                continue;
            }

            if (IsInputVisible(p, controlFieldKey, value))
            {
                keys.Add(key);
            }
        }

        return keys;
    }

    /// <summary>Output keys visible for the given control-field value.</summary>
    public static List<string> ResolveVisibleOutputKeys(
        IList<StepRunnerOutputParamDef> outputDefs,
        string? controlFieldKey,
        string controlFieldValue)
    {
        var value = (controlFieldValue ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return new List<string>();
        }

        var keys = new List<string>();
        foreach (var p in outputDefs)
        {
            var key = (p.Key ?? string.Empty).Trim();
            if (key.Length == 0)
            {
                continue;
            }

            if (IsOutputVisible(p, controlFieldKey, value))
            {
                keys.Add(key);
            }
        }

        return keys;
    }

    public static string FormatValidControlValues(StepRunnerInputParamDef control) =>
        string.Join(
            ", ",
            control.SelectionItems
                .Select(si => (si.Value ?? string.Empty).Trim())
                .Where(v => v.Length > 0));

    private static bool IsVisibleForControlValue(
        IList<string> validForValues,
        IList<string> invalidForValues,
        string? visibleExpression,
        string? controlFieldKey,
        string controlFieldValue)
    {
        if (validForValues.Count > 0)
        {
            return validForValues.Any(v =>
                string.Equals(v, controlFieldValue, StringComparison.OrdinalIgnoreCase));
        }

        if (invalidForValues.Count > 0)
        {
            return !invalidForValues.Any(v =>
                string.Equals(v, controlFieldValue, StringComparison.OrdinalIgnoreCase));
        }

        return EvaluateVisibleExpression(visibleExpression, controlFieldKey, controlFieldValue);
    }

    private static bool EvaluateVisibleExpression(
        string? expression,
        string? controlFieldKey,
        string controlFieldValue)
    {
        var expr = (expression ?? string.Empty).Trim();
        if (expr.Length == 0)
        {
            return true;
        }

        var match = EqualityExpression.Match(expr);
        if (!match.Success)
        {
            // Unknown expression shape: do not hide fields (avoid false negatives).
            return true;
        }

        var key = match.Groups["key"].Value;
        var expected = match.Groups["value"].Value;
        if (!string.IsNullOrWhiteSpace(controlFieldKey)
            && !string.Equals(key, controlFieldKey.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return string.Equals(expected, controlFieldValue, StringComparison.OrdinalIgnoreCase);
    }
}
