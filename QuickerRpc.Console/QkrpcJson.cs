using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickerRpc.Console;

/// <summary>Shared JSON options for qkrpc CLI stdout.</summary>
internal static class QkrpcJson
{
    /// <summary>Emit UTF-8 Chinese as literal characters (not \uXXXX). Requires console UTF-8 (see Program.ConfigureConsoleUtf8).</summary>
    public static readonly JsonSerializerOptions CliOutput = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static readonly JsonSerializerOptions HelpOutput = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
