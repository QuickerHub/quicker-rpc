using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.Core;

/// <summary>
/// JSON text from <see cref="JToken"/> without single-arg <c>ToString(Formatting)</c>,
/// which Quicker's bundled Newtonsoft.Json (assembly 13.0.0.0) does not provide at plugin runtime.
/// </summary>
public static class JTokenCompat
{
    public static string Compact(JToken? token) => token?.ToString() ?? string.Empty;

    public static string Format(JToken? token, Formatting formatting) =>
        token is null ? string.Empty : token.ToString(formatting, (JsonConverter[]?)null);
}
