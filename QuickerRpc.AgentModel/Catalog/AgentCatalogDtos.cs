using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

public sealed class StepRunnerSearchItem
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string? ControlFieldValue { get; set; }
}

public sealed class SearchStepRunnersResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Keyword { get; set; }

    public int MatchCount { get; set; }

    public List<StepRunnerSearchItem> Items { get; set; } = new();
}

public sealed class ControlFieldSelection
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
}

public sealed class ControlFieldSchema
{
    public string Key { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Purpose { get; set; } = string.Empty;

    public List<ControlFieldSelection> Selection { get; set; } = new();
}

public sealed class AgentParamOption
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Hint { get; set; }
}

public sealed class AgentInputParamSchema
{
    public string Key { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Purpose { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsControlField { get; set; }

    public string ValueType { get; set; } = string.Empty;

    public string? InternalValueType { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Required { get; set; }

    public string? Default { get; set; }

    public List<AgentParamOption>? Options { get; set; }
}

public sealed class AgentOutputParamSchema
{
    public string Key { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Purpose { get; set; } = string.Empty;

    public string ValueType { get; set; } = string.Empty;

    public string? CustomTypeName { get; set; }
}

public sealed class StepRunnerAgentSchema
{
    public string StepRunnerKey { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public ControlFieldSchema? ControlField { get; set; }

    public List<AgentInputParamSchema> Inputs { get; set; } = new();

    public List<AgentOutputParamSchema> Outputs { get; set; } = new();
}

public sealed class StepRunnerDetailResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public StepRunnerAgentSchema? Schema { get; set; }
}
