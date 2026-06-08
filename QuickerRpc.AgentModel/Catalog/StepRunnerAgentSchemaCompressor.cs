using System;
using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Removes agent-noise from step-runner get schema before JSON serialization.</summary>
public static class StepRunnerAgentSchemaCompressor
{
    public static StepRunnerAgentSchema Compress(StepRunnerAgentSchema source)
    {
        if (source is null)
        {
            throw new ArgumentNullException(nameof(source));
        }

        var appliedControlValue = (source.AppliedControlFieldValue ?? string.Empty).Trim();
        var controlApplied = appliedControlValue.Length > 0;
        var controlFieldKey = (source.AppliedControlFieldKey ?? source.ControlField?.Key ?? string.Empty).Trim();
        var hasControlFieldMeta = source.ControlField is not null;

        var result = new StepRunnerAgentSchema
        {
            StepRunnerKey = source.StepRunnerKey ?? string.Empty,
            Name = source.Name ?? string.Empty,
            Description = TrimToNull(source.Description),
            AgentGuidance = TrimToNull(source.AgentGuidance),
        };

        if (!controlApplied && source.ControlField is not null)
        {
            result.ControlField = CompressControlField(source.ControlField);
        }

        foreach (var input in source.Inputs)
        {
            result.Inputs.Add(CompressInput(
                input,
                controlApplied,
                hasControlFieldMeta,
                controlFieldKey,
                appliedControlValue));
        }

        foreach (var output in source.Outputs)
        {
            result.Outputs.Add(CompressOutput(output));
        }

        if (!source.VisibilityFilteringAvailable)
        {
            result.VisibilityFilteringAvailable = false;
        }

        return result;
    }

    private static ControlFieldSchema CompressControlField(ControlFieldSchema source) =>
        new()
        {
            Key = source.Key ?? string.Empty,
            Title = TrimToNull(source.Title),
            Purpose = TrimToNull(source.Purpose),
            Selection = CopySelection(source.Selection),
        };

    private static List<ControlFieldSelection> CopySelection(IList<ControlFieldSelection> selection)
    {
        var list = new List<ControlFieldSelection>(selection.Count);
        foreach (var item in selection)
        {
            list.Add(new ControlFieldSelection
            {
                Key = item.Key ?? string.Empty,
                Name = item.Name ?? string.Empty,
                VisibleInputKeys = item.VisibleInputKeys is null || item.VisibleInputKeys.Count == 0
                    ? new List<string>()
                    : new List<string>(item.VisibleInputKeys),
                VisibleOutputKeys = item.VisibleOutputKeys is null || item.VisibleOutputKeys.Count == 0
                    ? new List<string>()
                    : new List<string>(item.VisibleOutputKeys),
            });
        }

        return list;
    }

    private static AgentInputParamSchema CompressInput(
        AgentInputParamSchema source,
        bool controlApplied,
        bool hasControlFieldMeta,
        string controlFieldKey,
        string appliedControlValue)
    {
        var key = source.Key ?? string.Empty;
        var isControlParam = source.IsControlField
            || (controlFieldKey.Length > 0
                && string.Equals(key, controlFieldKey, StringComparison.OrdinalIgnoreCase));

        var result = new AgentInputParamSchema
        {
            Key = key,
            Title = TrimToNull(source.Title),
            Purpose = TrimToNull(source.Purpose),
            ValueType = source.ValueType ?? string.Empty,
            InternalValueType = TrimToNull(source.InternalValueType),
            Required = source.Required,
            Default = ResolveInputDefault(source, controlApplied, isControlParam, appliedControlValue),
            FileExt = TrimToNull(source.FileExt),
        };

        if (source.IsControlField && !hasControlFieldMeta && !controlApplied)
        {
            result.IsControlField = true;
        }

        if (!ShouldOmitInputOptions(source, controlApplied, hasControlFieldMeta, isControlParam))
        {
            result.Options = CompressOptions(source.Options);
        }

        return result;
    }

    private static object? ResolveInputDefault(
        AgentInputParamSchema source,
        bool controlApplied,
        bool isControlParam,
        string appliedControlValue)
    {
        if (controlApplied && isControlParam && appliedControlValue.Length > 0)
        {
            return appliedControlValue;
        }

        return source.Default;
    }

    private static bool ShouldOmitInputOptions(
        AgentInputParamSchema source,
        bool controlApplied,
        bool hasControlFieldMeta,
        bool isControlParam)
    {
        if (source.Options is null || source.Options.Count == 0)
        {
            return true;
        }

        if (controlApplied && isControlParam)
        {
            return true;
        }

        return hasControlFieldMeta && isControlParam;
    }

    private static List<AgentParamOption>? CompressOptions(IList<AgentParamOption>? options)
    {
        if (options is null || options.Count == 0)
        {
            return null;
        }

        var list = new List<AgentParamOption>(options.Count);
        foreach (var option in options)
        {
            list.Add(new AgentParamOption
            {
                Key = option.Key ?? string.Empty,
                Name = TrimToNull(option.Name),
                Hint = TrimToNull(option.Hint),
            });
        }

        return list;
    }

    private static AgentOutputParamSchema CompressOutput(AgentOutputParamSchema source) =>
        new()
        {
            Key = source.Key ?? string.Empty,
            Title = TrimToNull(source.Title),
            Purpose = TrimToNull(source.Purpose),
            ValueType = source.ValueType ?? string.Empty,
            CustomTypeName = TrimToNull(source.CustomTypeName),
        };

    private static string? TrimToNull(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }
}
