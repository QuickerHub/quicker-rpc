using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickerRpc.Console.Serve;

internal sealed class ServeInvokeRequest
{
    [JsonPropertyName("hostBinding")]
    public QuickerRpc.Contracts.Rpc.QuickerRpcHostBinding? HostBinding { get; set; }

    [JsonPropertyName("op")]
    public string Op { get; set; } = string.Empty;

    [JsonPropertyName("args")]
    public JsonElement Args { get; set; }

    [JsonPropertyName("timeoutSeconds")]
    public int TimeoutSeconds { get; set; } = 120;
}

internal sealed class ServeInvokeResponse
{
    [JsonPropertyName("hostBinding")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public QuickerRpc.Contracts.Rpc.QuickerRpcHostBinding? HostBinding { get; set; }

    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("data")]
    public object? Data { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

internal sealed class ServeHealthResponse
{
    public string Service { get; set; } = "qkrpc";
    public QuickerRpc.Contracts.Rpc.QuickerRpcHostBinding? HostBinding { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }

    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("pong")]
    public string? Pong { get; set; }

    [JsonPropertyName("protocolVersion")]
    public int ProtocolVersion { get; set; }

    [JsonPropertyName("pipe")]
    public string Pipe { get; set; } = string.Empty;

    [JsonPropertyName("hostSession")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public QuickerRpc.Contracts.Rpc.QuickerRpcHostSessionInfo? HostSession { get; set; }
}
