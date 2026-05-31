using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Services;

/// <summary>Maps Quicker step runners to <see cref="StepRunnerCatalog"/> via reflection.</summary>
internal static class StepRunnerCatalogFromQuicker
{
    public static StepRunnerCatalog Build()
    {
        var items = new List<StepRunnerDefinition>();
        if (!QuickerHost.IsRunningInQuicker())
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
            return new StepRunnerCatalog();
        }

        if (runners is null)
        {
            return new StepRunnerCatalog();
        }

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

        return new StepRunnerCatalog { Items = items };
    }

    private static IEnumerable? TryGetAllRunners()
    {
        var stepRunnerServiceProp = typeof(AppState).GetProperty(
            "StepRunnerService",
            BindingFlags.Public | BindingFlags.Static);
        var service = stepRunnerServiceProp?.GetValue(null);
        if (service is null)
        {
            var serviceType = typeof(AppState).Assembly.GetType(
                "Quicker.Domain.Actions.X.StepRunners.IStepRunnerService",
                throwOnError: false);
            if (serviceType is not null)
            {
                service = typeof(AppState).GetMethod(
                        "GetService",
                        BindingFlags.Public | BindingFlags.Static,
                        binder: null,
                        types: new[] { typeof(Type) },
                        modifiers: null)
                    ?.Invoke(null, new object[] { serviceType });
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

            list.Add(
                new StepRunnerInputParamDef
                {
                    Key = key,
                    Name = ReadString(p, "Name") ?? string.Empty,
                    Description = ReadString(p, "Description") ?? string.Empty,
                    VarType = ReadEnumInt(p, "Type"),
                    InternalType = ReadNullableEnumInt(p, "InternalType"),
                    HasInternalType = ReadNullableEnumInt(p, "InternalType") > 0,
                    IsRequired = ReadBool(p, "IsRequired"),
                    IsControlField = ReadBool(p, "IsControlField"),
                    DefaultValue = SerializeDefault(ReadProperty(p, "DefaultValue")),
                    SelectionItems = MapSelection(ReadProperty(p, "SelectionItems")),
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
                });
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
}
