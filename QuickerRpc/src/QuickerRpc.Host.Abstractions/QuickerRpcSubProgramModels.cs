namespace QuickerRpc.Host;

/// <summary>Read model for headless global subprogram load.</summary>
public sealed class QuickerRpcSubProgramSnapshot
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? CallIdentifier { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public long EditVersion { get; set; }

    /// <summary>Subprogram body JSON: steps, variables, optional subPrograms.</summary>
    public string BodyJson { get; set; } = string.Empty;
}

public sealed class QuickerRpcSubProgramWriteOptions
{
    public long? ExpectedEditVersion { get; set; }

    public bool Force { get; set; }
}

public sealed class QuickerRpcSubProgramBodyWrite
{
    public string IdOrName { get; set; } = string.Empty;

    public string BodyJson { get; set; } = string.Empty;

    public QuickerRpcSubProgramWriteOptions Options { get; set; } = new();
}

public sealed class QuickerRpcSubProgramCreate
{
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Icon { get; set; }
}

public sealed class QuickerRpcSubProgramWriteResult
{
    public bool Success { get; set; }

    public string IdOrName { get; set; } = string.Empty;

    public string? SubProgramId { get; set; }

    public long EditVersion { get; set; }

    public bool VersionConflict { get; set; }

    public string? ErrorMessage { get; set; }

    /// <summary>Human-readable message after create/delete (wire mapping).</summary>
    public string? Message { get; set; }

    public string? Name { get; set; }

    public string? CallIdentifier { get; set; }

    public static QuickerRpcSubProgramWriteResult Ok(string idOrName, string? subProgramId, long editVersion) =>
        new()
        {
            Success = true,
            IdOrName = idOrName,
            SubProgramId = subProgramId,
            EditVersion = editVersion,
        };

    public static QuickerRpcSubProgramWriteResult Fail(string idOrName, string message) =>
        new() { Success = false, IdOrName = idOrName, ErrorMessage = message };

    public static QuickerRpcSubProgramWriteResult Conflict(string idOrName, long currentEditVersion, string message) =>
        new()
        {
            Success = false,
            IdOrName = idOrName,
            VersionConflict = true,
            EditVersion = currentEditVersion,
            ErrorMessage = message,
        };
}
