using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Fast offline lint (structure + interpolation prefix) — no Quicker RPC.</summary>
public static class ProgramStaticLint
{
    public static IList<ProgramSyntaxIssue> Analyze(string projectDirectory, JObject data)
    {
        var issues = new List<ProgramSyntaxIssue>();
        issues.AddRange(ProgramStructureLint.Analyze(data));
        issues.AddRange(ProgramBranchStructureLint.Analyze(data));
        issues.AddRange(InputScriptSyntaxLint.Analyze(projectDirectory, data));

        var variableKeys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        if (variableKeys.Count > 0)
        {
            string? dataJsonText = null;
            var dataPath = Path.Combine(projectDirectory, "data.json");
            if (File.Exists(dataPath))
            {
                dataJsonText = File.ReadAllText(dataPath);
            }

            issues.AddRange(InterpolationPrefixLint.Analyze(data, variableKeys, dataJsonText));
        }

        issues.AddRange(CollectMissingFileIssues(projectDirectory, data));
        return issues;
    }

    private static IEnumerable<ProgramSyntaxIssue> CollectMissingFileIssues(
        string projectDirectory,
        JObject data)
    {
        foreach (var item in ProgramSyntaxCollector.Collect(projectDirectory, data))
        {
            if (!string.IsNullOrWhiteSpace(item.File) && string.IsNullOrWhiteSpace(item.Code))
            {
                yield return ProgramSyntaxIssueFactory.Create(
                    item,
                    ProgramSyntaxIssueSeverity.Error,
                    item.Kind,
                    "FILE_NOT_FOUND",
                    $"Referenced file not found: {item.File}");
            }
        }
    }
}
