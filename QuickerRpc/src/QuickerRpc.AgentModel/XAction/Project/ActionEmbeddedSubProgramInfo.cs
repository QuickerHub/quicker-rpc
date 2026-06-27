namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Metadata for an action-embedded subprogram (<c>subprograms/{id}/info.json</c>).</summary>
public sealed class ActionEmbeddedSubProgramInfo
{
    public const string KindValue = "embedded-subprogram";

    public string? Kind { get; set; } = KindValue;

    public string? Id { get; set; }

    public string? Name { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? SummaryExpression { get; set; }

    public bool? IsLocalEdited { get; set; }

    public bool? IsProtected { get; set; }

    /// <summary>Shared / template reference (no local data.json).</summary>
    public string? TemplateId { get; set; }

    public int? TemplateRevision { get; set; }

    public bool? UseServerVersion { get; set; }

    public string? SharedId { get; set; }

    public string? CreateTimeUtc { get; set; }

    public string? LastEditTimeUtc { get; set; }

    public string? ShareTimeUtc { get; set; }
}
