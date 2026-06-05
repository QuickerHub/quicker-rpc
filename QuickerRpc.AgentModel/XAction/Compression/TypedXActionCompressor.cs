using System;
using System.Collections.Generic;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.Proto.V1;

using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Compression;

/// <summary>Compresses <see cref="XActionData"/> into agent wire protobuf (serialized via <see cref="Proto.AgentCompressedProgramJson"/>).</summary>
internal static class TypedXActionCompressor
{
    public static AgentCompressedProgram CompressProgram(
        XActionData source,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var program = new AgentCompressedProgram();
        foreach (var step in source.Steps)
        {
            program.Steps.Add(CompressStep(step, catalog, omitDefaultLiteralInputs));
        }

        foreach (var variable in source.Variables)
        {
            program.Variables.Add(CompressVariable(variable));
        }

        return program;
    }

    public static AgentCompressedStep CompressStep(
        XStepData step,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var runnerKey = step.StepRunnerKey ?? string.Empty;
        var runner = omitDefaultLiteralInputs && runnerKey.Length > 0
            ? catalog.TryFind(runnerKey)
            : null;

        var result = new AgentCompressedStep
        {
            StepRunnerKey = runnerKey,
        };

        if (!string.IsNullOrEmpty(step.StepId))
        {
            result.StepId = step.StepId;
        }

        var compressedInputs = CompressInputParams(step.InputParams, runner, omitDefaultLiteralInputs);
        foreach (var kv in compressedInputs)
        {
            result.InputParams[kv.Key] = kv.Value;
        }

        var compressedOutputs = CompressOutputParams(step.OutputParams);
        foreach (var kv in compressedOutputs)
        {
            result.OutputParams[kv.Key] = kv.Value;
        }

        foreach (var child in step.IfSteps)
        {
            result.IfSteps.Add(CompressStep(child, catalog, omitDefaultLiteralInputs));
        }

        foreach (var child in step.ElseSteps)
        {
            result.ElseSteps.Add(CompressStep(child, catalog, omitDefaultLiteralInputs));
        }

        OmitDefaultPresentationFields(step, result);
        return result;
    }

    public static AgentCompressedVariable CompressVariable(XVariableData variable)
    {
        var result = new AgentCompressedVariable
        {
            Key = variable.Key ?? string.Empty,
        };

        var varTypeName = VariableVarTypeNames.Resolve(variable.Type);
        if (!string.Equals(varTypeName, "text", StringComparison.Ordinal))
        {
            result.VarType = varTypeName;
        }

        if (variable.Type is VariableDefaultValueNormalizer.VarTypeText or VariableDefaultValueNormalizer.VarTypeAny)
        {
            result.DefaultValue = string.IsNullOrEmpty(variable.DefaultValue)
                ? string.Empty
                : variable.DefaultValue;
        }
        else if (!string.IsNullOrEmpty(variable.DefaultValue))
        {
            result.DefaultValue = variable.DefaultValue;
        }

        if (!string.IsNullOrEmpty(variable.Desc))
        {
            result.Desc = variable.Desc;
        }

        if (variable.IsLocked)
        {
            result.IsLocked = true;
        }

        if (variable.SaveState)
        {
            result.SaveState = true;
        }

        if (variable.IsInput)
        {
            result.IsInput = true;
        }

        if (variable.IsOutput)
        {
            result.IsOutput = true;
        }

        if (!string.IsNullOrEmpty(variable.ParamName))
        {
            result.ParamName = variable.ParamName;
        }

        if (!string.IsNullOrEmpty(variable.Group))
        {
            result.Group = variable.Group;
        }

        if (!string.IsNullOrEmpty(variable.CustomType))
        {
            result.CustomType = variable.CustomType;
        }

        if (variable.InputParamInfo != null && !IsEmptyInputParamInfo(variable.InputParamInfo))
        {
            result.InputParamInfo = MapInputParamInfo(variable.InputParamInfo);
        }

        if (variable.OutputParamInfo != null && !IsEmptyOutputParamInfo(variable.OutputParamInfo))
        {
            result.OutputParamInfo = MapOutputParamInfo(variable.OutputParamInfo);
        }

        if (variable.TableDef != null && variable.TableDef.Fields.Count > 0)
        {
            result.TableDef = MapTableDef(variable.TableDef);
        }

        return result;
    }

    private static void OmitDefaultPresentationFields(XStepData source, AgentCompressedStep target)
    {
        if (!string.IsNullOrEmpty(source.Note))
        {
            target.Note = source.Note;
        }

        if (source.Disabled)
        {
            target.Disabled = true;
        }

        if (source.Collapsed)
        {
            target.Collapsed = true;
        }

        if (source.DelayMs != 0)
        {
            target.DelayMs = source.DelayMs;
        }
    }

    private static Dictionary<string, AgentCompressedInputParam> CompressInputParams(
        IDictionary<string, XStepParamData> inputParams,
        StepRunnerDefinition? runner,
        bool omitDefaultLiteralInputs)
    {
        var defsByKey = BuildParamDefIndex(runner);
        var result = new Dictionary<string, AgentCompressedInputParam>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in inputParams)
        {
            var key = kv.Key;
            var param = kv.Value ?? new XStepParamData();
            var varKey = param.VarKey ?? string.Empty;
            var value = param.Value ?? string.Empty;

            if (omitDefaultLiteralInputs
                && string.IsNullOrEmpty(varKey)
                && string.IsNullOrEmpty(value))
            {
                continue;
            }

            if (omitDefaultLiteralInputs
                && string.IsNullOrEmpty(varKey)
                && TryGetParamDef(defsByKey, key, out var def)
                && !def.IsControlField
                && IsLiteralValue(value)
                && string.Equals(
                    XActionCompressor.SerializeDefaultForComparison(def.DefaultValue),
                    value,
                    StringComparison.Ordinal))
            {
                continue;
            }

            var compressed = CompressInputParamEntry(param);
            if (!string.IsNullOrEmpty(compressed.VarKey) || !string.IsNullOrEmpty(compressed.Value))
            {
                result[key] = compressed;
            }
        }

        return result;
    }

    private static AgentCompressedInputParam CompressInputParamEntry(XStepParamData param)
    {
        var compressed = new AgentCompressedInputParam();
        var varKey = param.VarKey ?? string.Empty;
        var value = param.Value ?? string.Empty;
        if (!string.IsNullOrEmpty(varKey))
        {
            compressed.VarKey = varKey;
        }

        if (!string.IsNullOrEmpty(value))
        {
            compressed.Value = value;
        }

        return compressed;
    }

    private static Dictionary<string, string> CompressOutputParams(IDictionary<string, string> outputParams)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in outputParams)
        {
            var s = kv.Value ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(s))
            {
                result[kv.Key] = s;
            }
        }

        return result;
    }

    private static Dictionary<string, StepRunnerInputParamDef> BuildParamDefIndex(StepRunnerDefinition? runner)
    {
        var d = new Dictionary<string, StepRunnerInputParamDef>(StringComparer.OrdinalIgnoreCase);
        if (runner is null)
        {
            return d;
        }

        foreach (var p in runner.InputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(p.Key) || d.ContainsKey(p.Key))
            {
                continue;
            }

            d[p.Key] = p;
        }

        return d;
    }

    private static bool TryGetParamDef(
        Dictionary<string, StepRunnerInputParamDef> defsByKey,
        string key,
        out StepRunnerInputParamDef def) =>
        defsByKey.TryGetValue(key, out def!);

    private static bool IsLiteralValue(string value) => value.IndexOf('$') < 0;

    private static bool IsEmptyInputParamInfo(XInputParamInfoData info) =>
        info.InputMethod == 0
        && string.IsNullOrEmpty(info.SelectionItems)
        && !info.OnlyUseSelect
        && !info.IsRequired
        && string.IsNullOrEmpty(info.ValidationPattern)
        && info.VariableMode == 0
        && string.IsNullOrEmpty(info.TextTools)
        && info.ReplaceMode == 0
        && !info.IsAdvanced
        && !info.AllowInput
        && !info.MultiLine
        && string.IsNullOrEmpty(info.VisibleExpression)
        && !info.SkipEval;

    private static bool IsEmptyOutputParamInfo(XOutputParamInfoData info) =>
        string.IsNullOrEmpty(info.VisibleExpression);

    private static AgentCompressedVariableInputInfo MapInputParamInfo(XInputParamInfoData info)
    {
        var target = new AgentCompressedVariableInputInfo();
        if (info.InputMethod != 0)
        {
            target.InputMethod = info.InputMethod;
        }

        if (!string.IsNullOrEmpty(info.SelectionItems))
        {
            target.SelectionItems = info.SelectionItems;
        }

        if (info.OnlyUseSelect)
        {
            target.OnlyUseSelect = true;
        }

        if (info.IsRequired)
        {
            target.IsRequired = true;
        }

        if (!string.IsNullOrEmpty(info.ValidationPattern))
        {
            target.ValidationPattern = info.ValidationPattern;
        }

        if (info.VariableMode != 0)
        {
            target.VariableMode = info.VariableMode;
        }

        if (!string.IsNullOrEmpty(info.TextTools))
        {
            target.TextTools = info.TextTools;
        }

        if (info.ReplaceMode != 0)
        {
            target.ReplaceMode = info.ReplaceMode;
        }

        if (info.IsAdvanced)
        {
            target.IsAdvanced = true;
        }

        if (info.AllowInput)
        {
            target.AllowInput = true;
        }

        if (info.MultiLine)
        {
            target.MultiLine = true;
        }

        if (!string.IsNullOrEmpty(info.VisibleExpression))
        {
            target.VisibleExpression = info.VisibleExpression;
        }

        if (info.SkipEval)
        {
            target.SkipEval = true;
        }

        return target;
    }

    private static AgentCompressedVariableOutputInfo MapOutputParamInfo(XOutputParamInfoData info) =>
        new AgentCompressedVariableOutputInfo
        {
            VisibleExpression = info.VisibleExpression ?? string.Empty,
        };

    private static AgentCompressedTableDef MapTableDef(XTableDefData tableDef)
    {
        var target = new AgentCompressedTableDef();
        foreach (var field in tableDef.Fields)
        {
            var mapped = new AgentCompressedTableField
            {
                FieldKey = field.FieldKey ?? string.Empty,
                Label = field.Label ?? string.Empty,
            };

            if (field.HasDictVarType)
            {
                mapped.DictVarType = field.DictVarType;
            }

            if (!string.IsNullOrEmpty(field.DefaultValue))
            {
                mapped.DefaultValue = field.DefaultValue;
            }

            target.Fields.Add(mapped);
        }

        return target;
    }
}

internal static class VariableVarTypeNames
{
    public static string Resolve(int varType) =>
        varType switch
        {
            0 => "text",
            1 => "number",
            2 => "boolean",
            3 => "image",
            4 => "list",
            6 => "dateTime",
            9 => "enum",
            10 => "dict",
            12 => "integer",
            13 => "table",
            _ => "object",
        };
}
