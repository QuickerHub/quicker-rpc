using System;
using System.IO;
using System.Text;
using Google.Protobuf;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Read/write proto <see cref="ActionProjectInfo"/> as camelCase <c>info.json</c>.</summary>
public static class ActionProjectInfoJson
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private static readonly JsonFormatter Formatter = new(
        new JsonFormatter.Settings(formatDefaultValues: false));

    private static readonly JsonParser Parser = new(
        JsonParser.Settings.Default.WithIgnoreUnknownFields(true));

    public static ActionProjectInfo Parse(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidOperationException("info.json is empty.");
        }

        var root = JObject.Parse(json);
        if (ShouldMigrateFromEnvelope(root))
        {
            return ActionProjectInfoMapper.FromMetadataGetEnvelope(root);
        }

        if (LooksLikeLegacyPascal(root))
        {
            return ActionProjectInfoMapper.FromLegacyPascal(root);
        }

        try
        {
            return Parser.Parse<ActionProjectInfo>(json);
        }
        catch (InvalidJsonException ex)
        {
            throw new InvalidOperationException($"Failed to parse info.json: {ex.Message}", ex);
        }
    }

    public static string Format(ActionProjectInfo info) => Formatter.Format(info);

    public static void Write(string path, ActionProjectInfo info)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        File.WriteAllText(path, $"{Format(info)}\n", Utf8NoBom);
    }

    private static bool ShouldMigrateFromEnvelope(JObject root) =>
        root["compressed"] is JObject
        || root["Compressed"] is JObject
        || (!string.IsNullOrWhiteSpace(root.Value<string>("actionId"))
            && string.IsNullOrWhiteSpace(root.Value<string>("id")));

    private static bool LooksLikeLegacyPascal(JObject root) =>
        root.Property("Id") != null
        || root.Property("Title") != null
        || root.Property("EditVersion") != null;
}
