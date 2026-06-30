using System.Collections;
using System.Reflection;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.V2.Reflection;

internal static class QuickerV2StepRunnerMapper
{
    public static StepRunnerDefinition? MapRunner(object runner)
    {
        var key = QuickerV2Reflection.ReadString(runner, "Key");
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var runnerType = runner.GetType();
        return new StepRunnerDefinition
        {
            Key = key,
            Name = QuickerV2Reflection.ReadString(runner, "Name") ?? string.Empty,
            Description = QuickerV2Reflection.ReadString(runner, "Description") ?? string.Empty,
            Icon = QuickerV2Reflection.ReadString(runner, "Icon") ?? string.Empty,
            Category = ReadEnumString(runner, "Category"),
            InputParamDefs = MapInputs(runnerType.GetProperty("InputParams")?.GetValue(runner)),
            OutputParamDefs = MapOutputs(runnerType.GetProperty("OutputParams")?.GetValue(runner)),
        };
    }

    private static IList<StepRunnerInputParamDef> MapInputs(object? defs)
    {
        var list = new List<StepRunnerInputParamDef>();
        if (defs is not IEnumerable enumerable)
        {
            return list;
        }

        foreach (var p in enumerable)
        {
            if (p is null)
            {
                continue;
            }

            var key = QuickerV2Reflection.ReadString(p, "Key");
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var varType = ReadEnumInt(p, "Type");
            var selectionItems = MapSelection(ReadProperty(p, "SelectionItems"));
            list.Add(new StepRunnerInputParamDef
            {
                Key = key,
                Name = QuickerV2Reflection.ReadString(p, "Name") ?? string.Empty,
                Description = QuickerV2Reflection.ReadString(p, "Description") ?? string.Empty,
                VarType = varType,
                InternalType = ReadNullableEnumInt(p, "InternalType"),
                HasInternalType = ReadNullableEnumInt(p, "InternalType") > 0,
                IsRequired = ReadBool(p, "IsRequired"),
                IsControlField = ReadBool(p, "IsControlField"),
                VariableMode = ResolveWebInputVariableMode(
                    varType,
                    ReadEnumInt(p, "VariableMode"),
                    selectionItems.Count > 0),
                IsMultiLine = ReadBool(p, "IsMultiLine"),
                IsAdvanced = ReadBool(p, "IsAdvanced"),
                AllowInput = ReadBool(p, "AllowInput"),
                TextTools = SerializeTextTools(ReadProperty(p, "TextTools")),
                DefaultValue = StepRunnerAgentDefaultValue.NormalizeCatalogDefault(
                    varType,
                    SerializeDefault(ReadProperty(p, "DefaultValue"))),
                SelectionItems = selectionItems,
                ValidForValues = MapStringCollection(ReadProperty(p, "ValidForList")),
                InvalidForValues = MapStringCollection(ReadProperty(p, "InvalidForList")),
                VisibleExpression = QuickerV2Reflection.ReadString(p, "VisibleExpression") ?? string.Empty,
            });
        }

        return list;
    }

    private static IList<StepRunnerOutputParamDef> MapOutputs(object? defs)
    {
        var list = new List<StepRunnerOutputParamDef>();
        if (defs is not IEnumerable enumerable)
        {
            return list;
        }

        foreach (var p in enumerable)
        {
            if (p is null)
            {
                continue;
            }

            var key = QuickerV2Reflection.ReadString(p, "Key");
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            list.Add(new StepRunnerOutputParamDef
            {
                Key = key,
                Name = QuickerV2Reflection.ReadString(p, "Name") ?? string.Empty,
                Description = QuickerV2Reflection.ReadString(p, "Description") ?? string.Empty,
                VarType = ReadEnumInt(p, "Type"),
                CustomTypeName = QuickerV2Reflection.ReadString(p, "CustomTypeName") ?? string.Empty,
                ValidForValues = MapStringCollection(ReadProperty(p, "ValidForList")),
                InvalidForValues = MapStringCollection(ReadProperty(p, "InvalidForList")),
                VisibleExpression = QuickerV2Reflection.ReadString(p, "VisibleExpression") ?? string.Empty,
            });
        }

        return list;
    }

    private static IList<string> MapStringCollection(object? items)
    {
        var list = new List<string>();
        if (items is not IEnumerable enumerable)
        {
            return list;
        }

        foreach (var item in enumerable)
        {
            var text = item?.ToString()?.Trim();
            if (!string.IsNullOrEmpty(text))
            {
                list.Add(text);
            }
        }

        return list;
    }

    private static IList<StepRunnerParamSelectionItem> MapSelection(object? items)
    {
        var list = new List<StepRunnerParamSelectionItem>();
        if (items is not IEnumerable enumerable)
        {
            return list;
        }

        foreach (var si in enumerable)
        {
            if (si is null)
            {
                continue;
            }

            list.Add(new StepRunnerParamSelectionItem
            {
                Value = QuickerV2Reflection.ReadString(si, "Value") ?? string.Empty,
                Name = QuickerV2Reflection.ReadString(si, "Name") ?? string.Empty,
                Description = QuickerV2Reflection.ReadString(si, "Description") ?? string.Empty,
            });
        }

        return list;
    }

    private static object? ReadProperty(object target, string propertyName) =>
        target.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance)?.GetValue(target);

    private static bool ReadBool(object target, string propertyName)
    {
        var value = ReadProperty(target, propertyName);
        return value is bool b && b;
    }

    private static int ReadEnumInt(object target, string propertyName)
    {
        var value = ReadProperty(target, propertyName);
        return value is Enum e ? Convert.ToInt32(e) : 0;
    }

    private static int ReadNullableEnumInt(object target, string propertyName)
    {
        var value = ReadProperty(target, propertyName);
        if (value is null)
        {
            return 0;
        }

        return value is Enum e ? Convert.ToInt32(e) : 0;
    }

    private static string ReadEnumString(object target, string propertyName)
    {
        var value = ReadProperty(target, propertyName);
        return value?.ToString() ?? string.Empty;
    }

    private static string SerializeDefault(object? value) =>
        value switch
        {
            null => string.Empty,
            bool b => b ? "true" : "false",
            IFormattable f => f.ToString(null, System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty,
            _ => value.ToString() ?? string.Empty,
        };

    private static int ResolveWebInputVariableMode(int varType, int variableMode, bool hasSelectionItems)
    {
        const int inputMode = 1;
        const int useVarOrInputMode = 0;

        if (variableMode != inputMode)
        {
            return variableMode;
        }

        return varType switch
        {
            2 => inputMode,
            9 when hasSelectionItems => inputMode,
            11 => inputMode,
            14 => inputMode,
            _ => useVarOrInputMode,
        };
    }

    private static string SerializeTextTools(object? tools)
    {
        if (tools is not IEnumerable enumerable)
        {
            return string.Empty;
        }

        var parts = new List<string>();
        foreach (var tool in enumerable)
        {
            var text = tool?.ToString()?.Trim();
            if (!string.IsNullOrEmpty(text))
            {
                parts.Add(text);
            }
        }

        return string.Join(",", parts);
    }
}
