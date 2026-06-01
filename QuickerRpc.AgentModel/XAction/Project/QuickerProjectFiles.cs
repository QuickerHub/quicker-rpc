using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Read/write <c>info.json</c> and <c>data.json</c> for local projects.</summary>
public static class QuickerProjectFiles
{
    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
    };

    public static ActionProjectInfo ReadActionInfo(string projectDirectory)
    {
        var path = QuickerProjectLayout.GetInfoPath(projectDirectory);
        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        return JsonConvert.DeserializeObject<ActionProjectInfo>(json, JsonSettings)
               ?? throw new InvalidOperationException($"Failed to parse {path}.");
    }

    public static SubProgramProjectInfo ReadSubProgramInfo(string projectDirectory)
    {
        var path = QuickerProjectLayout.GetInfoPath(projectDirectory);
        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        return JsonConvert.DeserializeObject<SubProgramProjectInfo>(json, JsonSettings)
               ?? throw new InvalidOperationException($"Failed to parse {path}.");
    }

    public static void WriteActionInfo(string projectDirectory, ActionProjectInfo info) =>
        WriteJson(QuickerProjectLayout.GetInfoPath(projectDirectory), info);

    public static void WriteSubProgramInfo(string projectDirectory, SubProgramProjectInfo info) =>
        WriteJson(QuickerProjectLayout.GetInfoPath(projectDirectory), info);

    public static JObject ReadData(string projectDirectory)
    {
        var path = QuickerProjectLayout.GetDataPath(projectDirectory);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"data.json not found: {path}", path);
        }

        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        if (!TryParseDataRoot(json, out var root, out var error))
        {
            throw new InvalidOperationException(error ?? $"Invalid data.json: {path}");
        }

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

        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        if (!TryParseDataRoot(json, out data, out _))
        {
            data = null;
            return false;
        }

        return true;
    }

    public static void WriteData(string projectDirectory, JObject data)
    {
        Directory.CreateDirectory(projectDirectory);
        WriteJson(QuickerProjectLayout.GetDataPath(projectDirectory), data);
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

        File.WriteAllText(path, JsonConvert.SerializeObject(value, JsonSettings), System.Text.Encoding.UTF8);
    }
}
