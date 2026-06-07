using System;
using System.IO;
using System.Linq;
using System.Text;
using Google.Protobuf.WellKnownTypes;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Read/write <c>info.json</c> and <c>data.json</c> for local projects.</summary>
public static class QuickerProjectFiles
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
    };

    public static ActionProjectInfo ReadActionInfo(string projectDirectory)
    {
        var path = QuickerProjectLayout.GetInfoPath(projectDirectory);
        var json = File.ReadAllText(path, Utf8NoBom);
        return ActionProjectInfoJson.Parse(json);
    }

    public static SubProgramProjectInfo ReadSubProgramInfo(string projectDirectory)
    {
        var path = QuickerProjectLayout.GetInfoPath(projectDirectory);
        var json = File.ReadAllText(path, Utf8NoBom);
        return JsonConvert.DeserializeObject<SubProgramProjectInfo>(json, JsonSettings)
               ?? throw new InvalidOperationException($"Failed to parse {path}.");
    }

    public static void WriteActionInfo(string projectDirectory, ActionProjectInfo info) =>
        ActionProjectInfoJson.Write(QuickerProjectLayout.GetInfoPath(projectDirectory), info);

    public static void WriteSubProgramInfo(string projectDirectory, SubProgramProjectInfo info) =>
        WriteJson(QuickerProjectLayout.GetInfoPath(projectDirectory), info);

    public static JObject ReadData(string projectDirectory)
    {
        var path = QuickerProjectLayout.GetDataPath(projectDirectory);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"data.json not found: {path}", path);
        }

        var json = File.ReadAllText(path, Utf8NoBom);
        if (!TryParseDataRoot(json, out var root, out var error))
        {
            throw new InvalidOperationException(error ?? $"Invalid data.json: {path}");
        }

        InputParamWireCoercer.ExpandStepsRecursive(root!["steps"] as JArray);
        VariableDefaultValueWireCoercer.ExpandVariablesRecursive(root!["variables"] as JArray);
        return root!;
    }

    public static bool TryReadDataIfExists(string projectDirectory, out JObject? data)
    {
        data = null;
        var path = QuickerProjectLayout.GetDataPath(projectDirectory);
        if (!File.Exists(path))
        {
            return false;
        }

        var json = File.ReadAllText(path, Utf8NoBom);
        if (!TryParseDataRoot(json, out data, out _))
        {
            data = null;
            return false;
        }

        InputParamWireCoercer.ExpandStepsRecursive(data!["steps"] as JArray);
        VariableDefaultValueWireCoercer.ExpandVariablesRecursive(data!["variables"] as JArray);
        return true;
    }

    public static void WriteData(string projectDirectory, JObject data)
    {
        Directory.CreateDirectory(projectDirectory);
        var toWrite = (JObject)data.DeepClone();
        InputParamWireCoercer.CompactStepsRecursive(toWrite["steps"] as JArray);
        VariableDefaultValueWireCoercer.CompactVariablesRecursive(toWrite["variables"] as JArray);
        WriteJson(QuickerProjectLayout.GetDataPath(projectDirectory), toWrite);
    }

    public static bool TryParseDataRoot(string json, out JObject? root, out string? error)
    {
        root = null;
        error = null;
        try
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                error = "data.json is empty.";
                return false;
            }

            var token = JToken.Parse(json);
            if (token is not JObject obj)
            {
                error = "data.json root must be a JSON object.";
                return false;
            }

            if (obj["steps"] is not JArray)
            {
                error = "data.json must contain a steps array.";
                return false;
            }

            if (obj["variables"] is not JArray)
            {
                error = "data.json must contain a variables array.";
                return false;
            }

            root = obj;
            return true;
        }
        catch (JsonException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static void WriteJson(string path, object value)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        File.WriteAllText(path, JsonConvert.SerializeObject(value, JsonSettings), Utf8NoBom);
    }
}
