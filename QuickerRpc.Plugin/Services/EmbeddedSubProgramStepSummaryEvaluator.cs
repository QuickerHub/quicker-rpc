using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.BuiltinRunners;
using Quicker.Domain.Actions.X.StepRunners;
using Quicker.Domain.Actions.X.SubPrograms;
using StorageActionStep = Quicker.Domain.Actions.X.Storage.ActionStep;
using StorageActionVariable = Quicker.Domain.Actions.X.Storage.ActionVariable;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// sys:subprogram summary from <see cref="SubProgram.SummaryExpression"/> (mirrors DesignerHost evaluator).
/// </summary>
internal static class EmbeddedSubProgramStepSummaryEvaluator
{
    private static readonly Regex PlaceholderRegex = new(@"\{([^}^{]+)\}", RegexOptions.Compiled);

    public static string? TryEvaluate(
        StorageActionStep step,
        IEnumerable<SubProgram>? embeddedSubPrograms)
    {
        if (step.InputParams == null
            || !step.InputParams.TryGetValue(SubProgramStep.SubProgramNameParam.Key, out var namePin))
        {
            return null;
        }

        var identifier = (namePin?.Value ?? string.Empty).Trim();
        if (identifier.Length == 0)
        {
            return null;
        }

        var sub = SubProgramHelper.GetSubProgramByIdentifier(identifier, null);
        if (sub == null && embeddedSubPrograms != null)
        {
            sub = SubProgramHelper.GetSubProgramByIdentifier(identifier, embeddedSubPrograms);
        }

        if (sub == null)
        {
            return ReadPersistedSummary(step);
        }

        var expr = (sub.SummaryExpression ?? string.Empty).Trim();
        if (expr.StartsWith("$$", StringComparison.Ordinal))
        {
            expr = expr.Substring(2).Trim();
        }

        if (string.IsNullOrEmpty(expr))
        {
            return ReadPersistedSummary(step);
        }

        try
        {
            return PlaceholderRegex.Replace(
                expr,
                m =>
                {
                    var key = m.Groups[1].Value.Trim();
                    if (key.Length == 0)
                    {
                        return m.Value;
                    }

                    var vin = sub.Variables?.FirstOrDefault(
                        v => v.IsInput && string.Equals(v.Key, key, StringComparison.OrdinalIgnoreCase));
                    if (vin != null)
                    {
                        return XActionHelper.GetParamDisplayString(ToInDef(vin), step);
                    }

                    var vout = sub.Variables?.FirstOrDefault(
                        v => v.IsOutput && string.Equals(v.Key, key, StringComparison.OrdinalIgnoreCase));
                    if (vout != null)
                    {
                        return XActionHelper.GetOutputParamDisplayString(ToOutDef(vout), step);
                    }

                    return m.Value;
                });
        }
        catch
        {
            return ReadPersistedSummary(step);
        }
    }

    private static string? ReadPersistedSummary(StorageActionStep step)
    {
        if (step.InputParams == null
            || !step.InputParams.TryGetValue(SubProgramStep.SubProgramSummaryParam.Key, out var p))
        {
            return null;
        }

        var s = (p?.Value ?? string.Empty).Trim();
        return s.Length > 0 ? s : null;
    }

    private static StepInParamDef ToInDef(StorageActionVariable v) =>
        new()
        {
            Key = "var:" + v.Key,
            Name = v.GetParamName(),
            DefaultValue = v.DefaultValue ?? string.Empty,
            Description = v.Desc ?? string.Empty,
            Type = v.Type,
            InternalType = v.Type,
            VariableMode = ParamVariableMode.UseVarOrInput,
        };

    private static StepOutParamDef ToOutDef(StorageActionVariable v) =>
        new()
        {
            Key = "var:" + v.Key,
            Name = v.GetParamName(),
            Description = v.Desc ?? string.Empty,
            Type = v.Type,
        };
}
