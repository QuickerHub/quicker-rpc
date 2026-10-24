using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>Builds UI step-runner catalog (keywords + control sub-items) from Quicker runners.</summary>
internal static class StepRunnerUiCatalogBuilder
{
    internal static DesignerStepRunnerUiCatalog Build() => BuildCore();

    internal static void InvalidateCache()
    {
        // Kept for existing plugin-registration callers; native reads are no longer cached.
    }

    private static DesignerStepRunnerUiCatalog BuildCore()
    {
        var catalog = new DesignerStepRunnerUiCatalog();
        if (!QuickerHost.IsRunningInQuicker())
        {
            return catalog;
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

        if (runners is null)
        {
            return catalog;
        }

        var items = new List<DesignerStepRunnerUiItem>();
        foreach (var ro in runners)
        {
            if (ro is null)
            {
                continue;
            }

            try
            {
                var item = MapRunner(ro);
                if (item is not null)
                {
                    items.Add(item);
                }
            }
            catch
            {
                // skip broken runner rows
            }
        }

        items.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));
        foreach (var item in items)
        {
            catalog.Items.Add(item);
        }

        return catalog;
    }

    private static IEnumerable? TryGetAllRunners()
    {
        var assembly = typeof(AppState).Assembly;
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

    private static DesignerStepRunnerUiItem? MapRunner(object runner)
    {
        var key = ReadString(runner, "Key");
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var item = new DesignerStepRunnerUiItem
        {
            Key = key.Trim(),
            Name = ReadString(runner, "Name") ?? string.Empty,
            Description = ReadString(runner, "Description") ?? string.Empty,
            Icon = ReadString(runner, "Icon") ?? string.Empty,
        };

        var keywords = ReadEnumerableStrings(ReadProperty(runner, "KeyWords"));
        foreach (var kw in keywords)
        {
            item.Keywords.Add(kw);
        }

        var inputParams = ReadProperty(runner, "InputParams") as IEnumerable;
        object? controlField = null;
        if (inputParams is not null)
        {
            foreach (var p in inputParams)
            {
                if (p is null)
                {
                    continue;
                }

                if (controlField is null
                    && ReadBool(p, "IsControlField")
                    && ReadSelectionItems(p) is { Count: > 0 } selection)
                {
                    controlField = p;
                    foreach (var si in selection)
                    {
                        item.SubItems.Add(si);
                    }
                }
            }
        }

        return item;
    }

    private static IList<DesignerStepRunnerUiSubItem> ReadSelectionItems(object param)
    {
        var list = new List<DesignerStepRunnerUiSubItem>();
        var items = ReadProperty(param, "SelectionItems") as IEnumerable;
        if (items is null)
        {
            return list;
        }

        foreach (var x in items)
        {
            if (x is null)
            {
                continue;
            }

            var value = ReadString(x, "Value") ?? string.Empty;
            if (value.Trim().Length == 0)
            {
                continue;
            }

            list.Add(
                new DesignerStepRunnerUiSubItem
                {
                    Key = value.Trim(),
                    Name = ReadString(x, "Name") ?? string.Empty,
                    Description = ReadString(x, "Description") ?? string.Empty,
                });
        }

        return list;
    }

    private static IList<string> ReadEnumerableStrings(object? value)
    {
        var list = new List<string>();
        if (value is not IEnumerable enumerable)
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

    private static object? ReadProperty(object target, string name) =>
        target.GetType().GetProperty(name, BindingFlags.Instance | BindingFlags.Public)?.GetValue(target);

    private static string? ReadString(object target, string name)
    {
        var value = ReadProperty(target, name);
        return value?.ToString();
    }

    private static bool ReadBool(object target, string name) =>
        ReadProperty(target, name) is bool b && b;
}

/// <summary>Bumps when <see cref="StepRunnerCatalogFromQuicker"/> cache is invalidated.</summary>
internal static class StepRunnerCatalogGeneration
{
    private static int _generation;

    internal static int Current => _generation;

    internal static void Bump() => _generation++;
}
