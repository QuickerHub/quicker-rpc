using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace QuickerRpc.AgentModel.XAction.Project;

internal static class ActionEmbeddedSubProgramProjectFiles
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
    };

    public static ActionEmbeddedSubProgramInfo ReadInfo(string subProgramProjectDirectory)
    {
        var path = QuickerProjectLayout.GetInfoPath(subProgramProjectDirectory);
        var json = File.ReadAllText(path, Utf8NoBom);
        return JsonConvert.DeserializeObject<ActionEmbeddedSubProgramInfo>(json, JsonSettings)
               ?? throw new InvalidOperationException($"Failed to parse {path}.");
    }

    public static void WriteInfo(string subProgramProjectDirectory, ActionEmbeddedSubProgramInfo info)
    {
        if (string.IsNullOrWhiteSpace(info.Kind))
        {
            info.Kind = ActionEmbeddedSubProgramInfo.KindValue;
        }

        var path = QuickerProjectLayout.GetInfoPath(subProgramProjectDirectory);
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        File.WriteAllText(path, JsonConvert.SerializeObject(info, JsonSettings), Utf8NoBom);
    }
}
