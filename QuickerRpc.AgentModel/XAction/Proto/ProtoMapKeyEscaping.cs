namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>
/// Protobuf JSON map keys containing <c>:</c> (e.g. <c>var:foo</c>) are ambiguous with extension fields;
/// escape before <see cref="Google.Protobuf.JsonParser"/> and restore after parse.
/// </summary>
internal static class ProtoMapKeyEscaping
{
    internal const char ColonReplacement = '\u001f';

    internal static string Encode(string key) =>
        string.IsNullOrEmpty(key) || key.IndexOf(':') < 0
            ? key
            : key.Replace(':', ColonReplacement);

    internal static string Decode(string key) =>
        string.IsNullOrEmpty(key) || key.IndexOf(ColonReplacement) < 0
            ? key
            : key.Replace(ColonReplacement, ':');
}
