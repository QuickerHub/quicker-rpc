using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>StepRunner catalog snapshot for compression and agent schema (protobuf-neutral).</summary>
public sealed class StepRunnerCatalog
{
    public IList<StepRunnerDefinition> Items { get; set; } = new List<StepRunnerDefinition>();

    public StepRunnerDefinition? TryFind(string stepRunnerKey)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return null;
        }

        foreach (var item in Items)
        {
            if (string.Equals((item.Key ?? string.Empty).Trim(), key, StringComparison.Ordinal))
            {
                return item;
            }
        }

        return null;
    }
}

public sealed class StepRunnerDefinition
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    public IList<StepRunnerInputParamDef> InputParamDefs { get; set; } = new List<StepRunnerInputParamDef>();

    public IList<StepRunnerOutputParamDef> OutputParamDefs { get; set; } = new List<StepRunnerOutputParamDef>();
}

public sealed class StepRunnerInputParamDef
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int VarType { get; set; }

    public int InternalType { get; set; }

    public bool HasInternalType { get; set; }

    public bool IsRequired { get; set; }

    public bool IsControlField { get; set; }

    public string DefaultValue { get; set; } = string.Empty;

    public IList<StepRunnerParamSelectionItem> SelectionItems { get; set; } =
        new List<StepRunnerParamSelectionItem>();

    /// <summary>Show only when control-field value is in this list (Quicker <c>ValidForList</c>).</summary>
    public IList<string> ValidForValues { get; set; } = new List<string>();

    /// <summary>Hide when control-field value is in this list (Quicker <c>InvalidForList</c>).</summary>
    public IList<string> InvalidForValues { get; set; } = new List<string>();

    /// <summary>Quicker designer visibility expression (e.g. <c>type=='move'</c>).</summary>
    public string VisibleExpression { get; set; } = string.Empty;
}

public sealed class StepRunnerOutputParamDef
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int VarType { get; set; }

    public string CustomTypeName { get; set; } = string.Empty;
}

public sealed class StepRunnerParamSelectionItem
{
    public string Value { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
}
