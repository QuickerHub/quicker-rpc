using System.Collections.Generic;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Agent-facing action summary (MCP / headless edit).</summary>
public sealed class QuickerRpcActionSummaryItem
{
    public string ActionId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public string LastEditTimeUtc { get; set; } = string.Empty;

    public string? ProfileId { get; set; }

    public string? ProfileName { get; set; }

    public string? ExeFile { get; set; }
}

public sealed class QuickerRpcGetCompressedActionResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ActionId { get; set; }

    public long? EditVersion { get; set; }

    /// <summary>Compressed XAction JSON (steps, variables, metadata).</summary>
    public string? CompressedJson { get; set; }

    public bool? OmitDefaultLiteralInputsApplied { get; set; }

    public int? SubProgramCount { get; set; }

    /// <summary>full | structure | metadata</summary>
    public string? ReturnMode { get; set; }
}

public sealed class QuickerRpcApplyXActionResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ActionId { get; set; }

    public long? EditVersion { get; set; }

    public bool? VersionConflict { get; set; }

    public string? UpdatedUtc { get; set; }
}

public sealed class QuickerRpcApplyActionPatchResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ActionId { get; set; }

    public long? EditVersion { get; set; }

    public bool? VersionConflict { get; set; }

    /// <summary>Compressed patched steps JSON array.</summary>
    public string? UpdatedStepsJson { get; set; }

    /// <summary>Compressed added steps JSON array.</summary>
    public string? AddedStepsJson { get; set; }

    /// <summary>Compressed patched variables JSON array.</summary>
    public string? UpdatedVariablesJson { get; set; }

    /// <summary>Compressed added variables JSON array.</summary>
    public string? AddedVariablesJson { get; set; }

    public string? UpdatedUtc { get; set; }
}

public sealed class QuickerRpcSearchActionSummariesResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Query { get; set; }

    /// <summary>Requested scope filter, if any.</summary>
    public string? Scope { get; set; }

    public int MatchCount { get; set; }

    public IList<QuickerRpcActionSummaryItem> Items { get; set; } = new List<QuickerRpcActionSummaryItem>();
}

public sealed class QuickerRpcStepRunnerSearchItem
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
}

public sealed class QuickerRpcSearchStepRunnersResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Keyword { get; set; }

    public int MatchCount { get; set; }

    public IList<QuickerRpcStepRunnerSearchItem> Items { get; set; } = new List<QuickerRpcStepRunnerSearchItem>();
}

public sealed class QuickerRpcSearchFontAwesomeIconsResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Keyword { get; set; }

    public int MatchCount { get; set; }

    /// <summary>EFontAwesomeIcon member names (e.g. Solid_AddressBook). Quicker icon: fa:{name}.</summary>
    public IList<string> Names { get; set; } = new List<string>();
}

public sealed class QuickerRpcStepRunnerDetailResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    /// <summary>Step runner agent schema JSON.</summary>
    public string? SchemaJson { get; set; }
}

public sealed class QuickerRpcGetCompressedSubProgramResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? SubProgramId { get; set; }

    public string? Name { get; set; }

    /// <summary>Pass to sys:subprogram inputParams.subProgram when calling from an action.</summary>
    public string? CallIdentifier { get; set; }

    public long? EditVersion { get; set; }

    public string? CompressedJson { get; set; }

    public bool? OmitDefaultLiteralInputsApplied { get; set; }

    /// <summary>full | structure | metadata</summary>
    public string? ReturnMode { get; set; }
}

public sealed class QuickerRpcCreateSubProgramResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? SubProgramId { get; set; }

    public string? Name { get; set; }

    public string? CallIdentifier { get; set; }

    public long EditVersion { get; set; }
}

public sealed class QuickerRpcApplySubProgramPatchResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? SubProgramId { get; set; }

    public string? CallIdentifier { get; set; }

    public long? EditVersion { get; set; }

    public bool? VersionConflict { get; set; }

    public string? UpdatedStepsJson { get; set; }

    public string? AddedStepsJson { get; set; }

    public string? UpdatedVariablesJson { get; set; }

    public string? AddedVariablesJson { get; set; }

    public string? UpdatedUtc { get; set; }
}
