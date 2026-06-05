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

    /// <summary>Last edit time in local timezone (human-readable, for tables/UI).</summary>
    public string LastEditTimeLocal { get; set; } = string.Empty;

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

    /// <summary>Non-fatal issues (e.g. unknown inputParams keys). Save may still succeed.</summary>
    public IList<string> Warnings { get; set; } = new List<string>();
}

public sealed class QuickerRpcUpdateActionMetadataResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ActionId { get; set; }

    public long? EditVersion { get; set; }

    public bool? VersionConflict { get; set; }

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? ContextMenuData { get; set; }

    public string? UpdatedUtc { get; set; }
}

public sealed class QuickerRpcApplyActionPatchResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ActionId { get; set; }

    public long? EditVersion { get; set; }

    public bool? VersionConflict { get; set; }

    /// <summary>True when patch JSON included title, description, icon, and/or contextMenuData.</summary>
    public bool? PresentationUpdated { get; set; }

    /// <summary>Compressed patched steps JSON array.</summary>
    public string? UpdatedStepsJson { get; set; }

    /// <summary>Compressed added steps JSON array.</summary>
    public string? AddedStepsJson { get; set; }

    /// <summary>Compressed patched variables JSON array.</summary>
    public string? UpdatedVariablesJson { get; set; }

    /// <summary>Compressed added variables JSON array.</summary>
    public string? AddedVariablesJson { get; set; }

    public string? UpdatedUtc { get; set; }

    /// <summary>Non-fatal issues (e.g. unknown inputParams keys). Save may still succeed.</summary>
    public IList<string> Warnings { get; set; } = new List<string>();
}

public sealed class QuickerRpcSearchActionSummariesResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Query { get; set; }

    /// <summary>Requested scope filter, if any.</summary>
    public string? Scope { get; set; }

    /// <summary>Applied sort: relevance | lastEdit | title.</summary>
    public string? Sort { get; set; }

    public int MatchCount { get; set; }

    public IList<QuickerRpcActionSummaryItem> Items { get; set; } = new List<QuickerRpcActionSummaryItem>();
}

public sealed class QuickerRpcStepRunnerSearchControlField
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;

    public string? Name { get; set; }
}

public sealed class QuickerRpcStepRunnerSearchItem
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Snippet { get; set; }

    public QuickerRpcStepRunnerSearchControlField? ControlField { get; set; }

    /// <summary>OR (|) query: multiple matching control modes (best first).</summary>
    public IList<QuickerRpcStepRunnerSearchControlField>? ControlFields { get; set; }

    /// <summary>Quicker icon spec, e.g. fa:Light_WindowMaximize.</summary>
    public string? Icon { get; set; }
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

    /// <summary>Compressed: Light_* (merged styles) or Brands_*; CLI spec: fa:{name} or fa:{name}:{#color}</summary>
    public IList<string> Names { get; set; } = new List<string>();

    /// <summary>Merged glyph family style (Light).</summary>
    public string? DefaultStyle { get; set; }
}

/// <summary>Resolved FA icon SVG path (from Quicker FontAwesome5 catalog).</summary>
public sealed class QuickerRpcFontAwesomeIconGeometry
{
    public string Spec { get; set; } = string.Empty;

    public string EnumName { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    public int Width { get; set; }

    public int Height { get; set; }

    public string? Color { get; set; }

    public string? Label { get; set; }

    public int Unicode { get; set; }
}

public sealed class QuickerRpcResolveFontAwesomeIconsResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public IList<QuickerRpcFontAwesomeIconGeometry> Items { get; set; } =
        new List<QuickerRpcFontAwesomeIconGeometry>();

    /// <summary>Per-spec errors for specs that could not be resolved.</summary>
    public IList<string> Errors { get; set; } = new List<string>();
}

public sealed class QuickerRpcStepRunnerDetailResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    /// <summary>Step runner schema JSON (agent-compressed or UI-full per RPC method).</summary>
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

    /// <summary>Non-fatal issues (e.g. unknown inputParams keys). Save may still succeed.</summary>
    public IList<string> Warnings { get; set; } = new List<string>();
}
