namespace QuickerRpc.Host;

public sealed class QuickerRpcActionSharingResult
{
    public bool Success { get; set; }

    public string ActionId { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public static QuickerRpcActionSharingResult Ok(string actionId, string message) =>
        new() { Success = true, ActionId = actionId, Message = message };

    public static QuickerRpcActionSharingResult Fail(string actionId, string message) =>
        new() { Success = false, ActionId = actionId, Message = message };
}
