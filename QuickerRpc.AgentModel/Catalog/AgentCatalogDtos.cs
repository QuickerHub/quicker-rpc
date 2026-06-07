using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

public sealed class StepRunnerSearchItem
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }

    /// <summary>One-line agent hint (curated snippet or description).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Snippet { get; set; }

    /// <summary>Best-matching control-field selection from keyword ranking (when present).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public StepRunnerControlFieldMatch? ControlField { get; set; }

    /// <summary>OR (|) query: multiple matching control modes on this module (best first).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<StepRunnerControlFieldMatch>? ControlFields { get; set; }

    /// <summary>Quicker icon spec, e.g. fa:Light_WindowMaximize.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Icon { get; set; }
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

    /// <summary>
    /// Input param keys visible when this control value is selected (from ValidFor / visibility rules).
    /// </summary>
    public List<string> VisibleInputKeys { get; set; } = new();

    /// <summary>
    /// Output param keys visible when this control value is selected.
    /// </summary>
    public List<string> VisibleOutputKeys { get; set; } = new();
}

public sealed class ControlFieldSchema
{
    public string Key { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Title { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Purpose { get; set; }

    public List<ControlFieldSelection> Selection { get; set; } = new();
}

public sealed class AgentParamOption
{
    public string Key { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Name { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Hint { get; set; }
}

public sealed class AgentInputParamSchema
{
    public string Key { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Title { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Purpose { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsControlField { get; set; }

    public string ValueType { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InternalValueType { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Required { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Default { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<AgentParamOption>? Options { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int VariableMode { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsMultiLine { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsAdvanced { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool AllowInput { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TextTools { get; set; }
}

public sealed class AgentOutputParamSchema
{
    public string Key { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Title { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Purpose { get; set; }

    public string ValueType { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CustomTypeName { get; set; }
}

public sealed class StepRunnerAgentSchema
{
    public string StepRunnerKey { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }

    /// <summary>Quicker icon spec, e.g. fa:Light_WindowMaximize.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Icon { get; set; }

    public ControlFieldSchema? ControlField { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AppliedControlFieldKey { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AppliedControlFieldValue { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool VisibilityFilteringAvailable { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AgentGuidance { get; set; }

    public List<AgentInputParamSchema> Inputs { get; set; } = new();

    public List<AgentOutputParamSchema> Outputs { get; set; } = new();
}

public sealed class StepRunnerDetailResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public StepRunnerAgentSchema? Schema { get; set; }
}
