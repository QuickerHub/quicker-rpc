using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Validation;

/// <summary>Optional context for step input param validation (e.g. sys:subprogram var:* IO).</summary>
public sealed class StepInputParamsValidationContext
{
    /// <summary>Action-embedded subprograms from XAction payload (wire or native shape).</summary>
    public JArray? EmbeddedSubPrograms { get; init; }

    /// <summary>Workspace root for loading global subprograms from <c>.quicker/subprograms</c>.</summary>
    public string? WorkspaceRoot { get; init; }

    /// <summary>Live resolver: subprogram id/name/callIdentifier → valid input <c>var:*</c> keys.</summary>
    public Func<string, IReadOnlyList<string>?>? ResolveGlobalSubProgramInputVarKeys { get; init; }
}
