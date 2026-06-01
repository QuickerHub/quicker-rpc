using System.Collections.Generic;

namespace QuickerRpc.AgentModel.XAction;

// Legacy hand-written DTOs — prefer Protos/agent_api.proto + generated Proto.V1 types for wire JSON.

public sealed class ActionSummary
{
    public string ActionId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public string LastEditTimeUtc { get; set; } = string.Empty;

    public string LastEditTimeLocal { get; set; } = string.Empty;
}

public sealed class SearchActionSummariesResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Query { get; set; }

    public int MatchCount { get; set; }

    public List<ActionSummary> Items { get; set; } = new();
}

public sealed class ApplyActionPatchResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ActionId { get; set; }

    public long? EditVersion { get; set; }

    public bool? VersionConflict { get; set; }

    public Newtonsoft.Json.Linq.JArray? UpdatedSteps { get; set; }

    public Newtonsoft.Json.Linq.JArray? AddedSteps { get; set; }

    public Newtonsoft.Json.Linq.JArray? UpdatedVariables { get; set; }

    public Newtonsoft.Json.Linq.JArray? AddedVariables { get; set; }
}
