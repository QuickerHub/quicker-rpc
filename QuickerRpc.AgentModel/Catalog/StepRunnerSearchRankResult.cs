namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Ranking breakdown for one step-runner search hit.</summary>
public sealed class StepRunnerSearchRankResult
{
    public int TotalScore { get; set; }

    public int ModuleScore { get; set; }

    public int ControlScore { get; set; }

    /// <summary>From <c>rankBias</c> in step-runner-agent-keywords.json.</summary>
    public int ModuleRankBias { get; set; }

    /// <summary>From <c>controlRankBias</c> for the selected control value.</summary>
    public int ControlRankBias { get; set; }

    public StepRunnerControlFieldMatch? Control { get; set; }
}

/// <summary>Best-matching control-field selection for search output.</summary>
public sealed class StepRunnerControlFieldMatch
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
}
