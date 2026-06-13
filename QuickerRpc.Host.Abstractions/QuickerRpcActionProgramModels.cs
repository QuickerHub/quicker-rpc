namespace QuickerRpc.Host;

/// <summary>Presentation fields for an XAction program.</summary>
public sealed class QuickerRpcActionPresentation
{
    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public string ContextMenuData { get; set; } = string.Empty;
}

/// <summary>Read model for headless XAction load (body JSON is the authoritative program payload).</summary>
public sealed class QuickerRpcActionProgramSnapshot
{
    public string ActionId { get; set; } = string.Empty;

    /// <summary>Unix milliseconds from host last-edit timestamp.</summary>
    public long EditVersion { get; set; }

    public QuickerRpcActionPresentation Presentation { get; set; } = new();

    /// <summary>
    /// XAction body JSON: steps, variables, optional subPrograms and XAction metadata fields.
    /// </summary>
    public string BodyJson { get; set; } = string.Empty;
}

/// <summary>Options for optimistic concurrency on program writes.</summary>
public sealed class QuickerRpcActionProgramWriteOptions
{
    public long? ExpectedEditVersion { get; set; }

    public bool Force { get; set; }

    /// <summary>When true (default), host bumps last-edit timestamp on successful save.</summary>
    public bool TouchLastEditUtc { get; set; } = true;
}

/// <summary>Replace or patch the XAction program body.</summary>
public sealed class QuickerRpcActionProgramBodyWrite
{
    public string ActionId { get; set; } = string.Empty;

    /// <summary>Full or partial XAction body JSON (steps/variables/subPrograms).</summary>
    public string BodyJson { get; set; } = string.Empty;

    public QuickerRpcActionProgramWriteOptions Options { get; set; } = new();
}

/// <summary>Update presentation-only fields without replacing the program body.</summary>
public sealed class QuickerRpcActionPresentationWrite
{
    public string ActionId { get; set; } = string.Empty;

    /// <summary>Null field means omit (do not change).</summary>
    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? ContextMenuData { get; set; }

    public QuickerRpcActionProgramWriteOptions Options { get; set; } = new();
}

/// <summary>Unified host write result.</summary>
public sealed class QuickerRpcActionProgramWriteResult
{
    public bool Success { get; set; }

    public string ActionId { get; set; } = string.Empty;

    public long EditVersion { get; set; }

    public bool VersionConflict { get; set; }

    public string? ErrorMessage { get; set; }

    public static QuickerRpcActionProgramWriteResult Ok(string actionId, long editVersion) =>
        new() { Success = true, ActionId = actionId, EditVersion = editVersion };

    public static QuickerRpcActionProgramWriteResult Fail(string actionId, string message) =>
        new() { Success = false, ActionId = actionId, ErrorMessage = message };

    public static QuickerRpcActionProgramWriteResult Conflict(string actionId, long currentEditVersion, string message) =>
        new()
        {
            Success = false,
            ActionId = actionId,
            VersionConflict = true,
            EditVersion = currentEditVersion,
            ErrorMessage = message,
        };
}
