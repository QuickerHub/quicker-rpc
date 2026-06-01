using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Resolves which StepRunner input params are visible for a control-field value.</summary>
public static class StepRunnerInputParamVisibility
{
    private static readonly Regex EqualityExpression = new(
        @"^\s*(?<key>[A-Za-z_][\w]*)\s*==\s*(?:'(?<value>[^']*)'|""(?<value>[^""]*)""|(?<value>[^'""\s]+))\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static bool RunnerHasInputVisibilityRules(StepRunnerDefinition runner) =>
        runner.InputParamDefs.Any(p => !p.IsControlField && ParamHasVisibilityRules(p));

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

        var value = controlFieldValue.Trim();

        if (param.ValidForValues.Count > 0)
        {
            return param.ValidForValues.Any(v =>
                string.Equals(v, value, StringComparison.OrdinalIgnoreCase));
        }

        if (param.InvalidForValues.Count > 0)
        {
            return !param.InvalidForValues.Any(v =>
                string.Equals(v, value, StringComparison.OrdinalIgnoreCase));
        }

        return EvaluateVisibleExpression(param.VisibleExpression, controlFieldKey, value);
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

    public static string FormatValidControlValues(StepRunnerInputParamDef control) =>
        string.Join(
            ", ",
            control.SelectionItems
                .Select(si => (si.Value ?? string.Empty).Trim())
                .Where(v => v.Length > 0));

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
