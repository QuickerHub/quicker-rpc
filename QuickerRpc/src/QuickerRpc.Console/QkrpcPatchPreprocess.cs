using System;
using System.IO;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Console;

internal static class QkrpcPatchPreprocess
{
    public static string? ResolveBaseDirectory(string? jsonFilePath)
    {
        var path = (jsonFilePath ?? string.Empty).Trim();
        if (path.Length == 0 || string.Equals(path, "-", StringComparison.Ordinal))
        {
            return null;
        }

        return Path.GetDirectoryName(Path.GetFullPath(path));
    }

    public static bool TryPreprocessPatch(JObject patch, string? jsonFilePath, out string? errorMessage)
    {
        var result = XActionProgramService.PreprocessPatch(patch, ResolveBaseDirectory(jsonFilePath));
        errorMessage = result.ErrorMessage;
        return result.Success;
    }

    public static bool TryPreprocessProgram(JObject program, string? jsonFilePath, out string? errorMessage)
    {
        var result = XActionFormSpecCompiler.Compile(program, ResolveBaseDirectory(jsonFilePath));
        errorMessage = result.ErrorMessage;
        return result.Success;
    }
}
