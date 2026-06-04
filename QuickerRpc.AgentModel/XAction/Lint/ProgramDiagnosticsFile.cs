using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Lint;

public static class ProgramDiagnosticsFile
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        Converters = { new StringEnumConverter(new CamelCaseNamingStrategy()) },
    };

    public static string GetDiagnosticsPath(string projectDirectory) =>
        Path.Combine(
            QuickerProjectLayout.ResolveProjectDirectory(projectDirectory),
            ".qkrpc",
            "diagnostics.json");

    public static string ComputeDataFingerprint(string projectDirectory)
    {
        var dataPath = QuickerProjectLayout.GetDataPath(projectDirectory);
        if (!File.Exists(dataPath))
        {
            return string.Empty;
        }

        var bytes = File.ReadAllBytes(dataPath);
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(bytes);
        return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
    }

    public static ProgramDiagnosticsDocument ReadOrDefault(string projectDirectory)
    {
        var path = GetDiagnosticsPath(projectDirectory);
        if (!File.Exists(path))
        {
            return new ProgramDiagnosticsDocument { Status = "none" };
        }

        try
        {
            var json = File.ReadAllText(path, Utf8NoBom);
            return JsonConvert.DeserializeObject<ProgramDiagnosticsDocument>(json, JsonSettings)
                   ?? new ProgramDiagnosticsDocument { Status = "none" };
        }
        catch
        {
            return new ProgramDiagnosticsDocument { Status = "failed", LintError = "Failed to read diagnostics.json." };
        }
    }

    public static void Write(string projectDirectory, ProgramDiagnosticsDocument document)
    {
        var path = GetDiagnosticsPath(projectDirectory);
        var folder = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(folder))
        {
            Directory.CreateDirectory(folder);
        }

        var json = JsonConvert.SerializeObject(document, JsonSettings);
        File.WriteAllText(path, json, Utf8NoBom);
    }

    public static bool IsStale(ProgramDiagnosticsDocument doc, string projectDirectory, long? editVersion)
    {
        var currentFingerprint = ComputeDataFingerprint(projectDirectory);
        if (!string.IsNullOrEmpty(doc.DataFingerprint)
            && !string.Equals(doc.DataFingerprint, currentFingerprint, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (editVersion.HasValue && doc.EditVersion.HasValue && doc.EditVersion != editVersion)
        {
            return true;
        }

        return false;
    }
}
