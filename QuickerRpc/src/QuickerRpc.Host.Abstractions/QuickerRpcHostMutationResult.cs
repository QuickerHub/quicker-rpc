namespace QuickerRpc.Host;

/// <summary>Unified result for host delete / simple mutation operations.</summary>
public sealed class QuickerRpcHostMutationResult
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? EntityId { get; set; }

    public static QuickerRpcHostMutationResult Ok(string? entityId, string message) =>
        new() { Success = true, EntityId = entityId, Message = message };

    public static QuickerRpcHostMutationResult Fail(string message, string? entityId = null) =>
        new() { Success = false, EntityId = entityId, Message = message };
}
