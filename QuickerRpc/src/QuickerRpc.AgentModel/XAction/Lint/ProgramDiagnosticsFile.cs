using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var dataPath = QuickerProjectLayout.GetDataPath(projectDir);
        if (!File.Exists(dataPath))
        {
            return string.Empty;
        }

        using var sha = SHA256.Create();
        AppendFingerprintSegment(sha, "data.json", File.ReadAllBytes(dataPath));

        var filesDir = Path.Combine(projectDir, QuickerProjectLayout.FilesDirName);
        if (Directory.Exists(filesDir))
        {
            foreach (var filePath in EnumerateProjectFilesSorted(filesDir))
            {
                var relative = ToFilesRelativePath(filesDir, filePath);
                AppendFingerprintSegment(sha, "files/" + relative, File.ReadAllBytes(filePath));
            }
        }

        sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
        return BitConverter.ToString(sha.Hash ?? Array.Empty<byte>())
            .Replace("-", string.Empty)
            .ToLowerInvariant();
    }

    private static IEnumerable<string> EnumerateProjectFilesSorted(string filesDir)
    {
        return Directory
            .EnumerateFiles(filesDir, "*", SearchOption.AllDirectories)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase);
    }

    private static string ToFilesRelativePath(string filesDir, string filePath)
    {
        var root = filesDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!filePath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            return Path.GetFileName(filePath);
        }

        var relative = filePath.Substring(root.Length)
            .TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return relative.Replace('\\', '/');
    }

    private static void AppendFingerprintSegment(SHA256 sha, string label, byte[] content)
    {
        var labelBytes = Utf8NoBom.GetBytes(label);
        sha.TransformBlock(labelBytes, 0, labelBytes.Length, null, 0);
        sha.TransformBlock(new byte[] { 0 }, 0, 1, null, 0);
        sha.TransformBlock(content, 0, content.Length, null, 0);
        sha.TransformBlock(new byte[] { 0 }, 0, 1, null, 0);
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
