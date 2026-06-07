using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>Maps Quicker step runners to <see cref="StepRunnerCatalog"/> via reflection.</summary>
internal static class StepRunnerCatalogFromQuicker
{
    private static StepRunnerCatalog? _cachedCatalog;
    private static readonly object CatalogLock = new();

    public static StepRunnerCatalog Build()
    {
        var cached = _cachedCatalog;
        if (cached is not null)
        {
            return cached;
        }

        lock (CatalogLock)
        {
            if (_cachedCatalog is not null)
            {
                return _cachedCatalog;
            }

            _cachedCatalog = BuildCore();
            return _cachedCatalog;
        }
    }

    /// <summary>Force rebuild after plugin step-runner registration changes.</summary>
    internal static void InvalidateCache()
    {
        lock (CatalogLock)
        {
            _cachedCatalog = null;
        }
    }

    private static StepRunnerCatalog BuildCore()
    {
        var items = new List<StepRunnerDefinition>();
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return new StepRunnerCatalog();
        }

        IEnumerable? runners;
        try
        {
            runners = TryGetAllRunners();
        }
        catch
        {
            runners = null;
        }

        if (runners is not null)
        {
            foreach (var ro in runners)
            {
                if (ro is null)
                {
                    continue;
                }

                try
                {
                    var mapped = MapRunner(ro);
                    if (mapped is not null)
                    {
                        items.Add(mapped);
                    }
                }
                catch
                {
                    // skip broken runner rows
                }
            }
        }

        MergeSupplementalRunners(items);
        return new StepRunnerCatalog { Items = items };
    }

    private static IEnumerable? TryGetAllRunners()
    {
        var assembly = typeof(AppState).Assembly;

        // QuickerPc: StepRunnerRegistry.GetAllRunners()
        var registryType = assembly.GetType(
            "Quicker.Domain.Actions.X.StepRunners.StepRunnerRegistry",
            throwOnError: false);
        var registryGetAll = registryType?.GetMethod(
            "GetAllRunners",
            BindingFlags.Public | BindingFlags.Static);
        var fromRegistry = registryGetAll?.Invoke(null, null) as IEnumerable;
        if (fromRegistry is not null)
        {
            return fromRegistry;
        }

        // Fallback: optional IStepRunnerService on AppState (other Quicker builds).
        var stepRunnerServiceProp = typeof(AppState).GetProperty(
            "StepRunnerService",
            BindingFlags.Public | BindingFlags.Static);
        var service = stepRunnerServiceProp?.GetValue(null);
        if (service is null)
        {
            var serviceType = assembly.GetType(
                "Quicker.Domain.Actions.X.StepRunners.IStepRunnerService",
                throwOnError: false);
            if (serviceType is not null)
            {
                service = QuickerInternalAccess.TryGetService(serviceType);
            }
        }

        if (service is null)
        {
            return null;
        }

        var getAll = service.GetType().GetMethod("GetAllRunners", BindingFlags.Public | BindingFlags.Instance);
        return getAll?.Invoke(service, null) as IEnumerable;
    }

    private static StepRunnerDefinition? MapRunner(object runner)
    {
        var runnerType = runner.GetType();
        var key = ReadString(runner, "Key");
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        return new StepRunnerDefinition
        {
            Key = key,
            Name = ReadString(runner, "Name") ?? string.Empty,
            Description = ReadString(runner, "Description") ?? string.Empty,
            Icon = ReadString(runner, "Icon") ?? string.Empty,
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

            var key = ReadString(p, "Key");
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var varType = ReadEnumInt(p, "Type");
            var selectionItems = MapSelection(ReadProperty(p, "SelectionItems"));
            list.Add(
                new StepRunnerInputParamDef
                {
                    Key = key,
                    Name = ReadString(p, "Name") ?? string.Empty,
                    Description = ReadString(p, "Description") ?? string.Empty,
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
                    DefaultValue = SerializeDefault(ReadProperty(p, "DefaultValue")),
                    SelectionItems = selectionItems,
                    ValidForValues = MapStringCollection(ReadProperty(p, "ValidForList")),
                    InvalidForValues = MapStringCollection(ReadProperty(p, "InvalidForList")),
                    VisibleExpression = ReadString(p, "VisibleExpression") ?? string.Empty,
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

            var key = ReadString(p, "Key");
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            list.Add(
                new StepRunnerOutputParamDef
                {
                    Key = key,
                    Name = ReadString(p, "Name") ?? string.Empty,
                    Description = ReadString(p, "Description") ?? string.Empty,
                    VarType = ReadEnumInt(p, "Type"),
                    CustomTypeName = ReadString(p, "CustomTypeName") ?? string.Empty,
                    ValidForValues = MapStringCollection(ReadProperty(p, "ValidForList")),
                    InvalidForValues = MapStringCollection(ReadProperty(p, "InvalidForList")),
                    VisibleExpression = ReadString(p, "VisibleExpression") ?? string.Empty,
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
            if (item is null)
            {
                continue;
            }

            var text = item.ToString()?.Trim();
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

            list.Add(
                new StepRunnerParamSelectionItem
                {
                    Value = ReadString(si, "Value") ?? string.Empty,
                    Name = ReadString(si, "Name") ?? string.Empty,
                    Description = ReadString(si, "Description") ?? string.Empty,
                });
        }

        return list;
    }

    private static void MergeSupplementalRunners(List<StepRunnerDefinition> items)
    {
        foreach (var supplemental in PluginStepRunnerCatalog.GetDefinitions())
        {
            if (items.Any(x => string.Equals(x.Key, supplemental.Key, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            items.Add(supplemental);
        }
    }

    private static string? ReadString(object target, string propertyName) =>
        target.GetType().GetProperty(propertyName)?.GetValue(target) as string;

    private static object? ReadProperty(object target, string propertyName) =>
        target.GetType().GetProperty(propertyName)?.GetValue(target);

    private static bool ReadBool(object target, string propertyName)
    {
        var value = target.GetType().GetProperty(propertyName)?.GetValue(target);
        return value is bool b && b;
    }

    private static int ReadEnumInt(object target, string propertyName)
    {
        var value = target.GetType().GetProperty(propertyName)?.GetValue(target);
        return value is Enum e ? Convert.ToInt32(e) : 0;
    }

    private static int ReadNullableEnumInt(object target, string propertyName)
    {
        var prop = target.GetType().GetProperty(propertyName);
        if (prop is null)
        {
            return 0;
        }

        var value = prop.GetValue(target);
        if (value is null)
        {
            return 0;
        }

        return value is Enum e ? Convert.ToInt32(e) : 0;
    }

    private static string ReadEnumString(object target, string propertyName)
    {
        var value = target.GetType().GetProperty(propertyName)?.GetValue(target);
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

    /// <summary>
    /// Web editors treat Input like Quicker.Designer: boolean/enum/form stay Input; others become UseVarOrInput.
    /// ParamVariableMode.Input = 1, UseVarOrInput = 0.
    /// </summary>
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
            2 => inputMode, // Boolean
            9 when hasSelectionItems => inputMode, // Enum with options
            11 => inputMode, // Form
            14 => inputMode, // FormForDict
            _ => useVarOrInputMode,
        };
    }

    private static string SerializeTextTools(object? tools)
    {
        if (tools is not IEnumerable enumerable)
        {
            return string.Empty;
        }

        var names = new List<string>();
        foreach (var item in enumerable)
        {
            if (item is null)
            {
                continue;
            }

            var text = item is Enum e ? e.ToString() : item.ToString();
            if (!string.IsNullOrWhiteSpace(text))
            {
                names.Add(text!.Trim());
            }
        }

        return names.Count == 0 ? string.Empty : string.Join(",", names);
    }
}
