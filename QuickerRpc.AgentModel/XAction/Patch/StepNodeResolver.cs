using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Patch;

/// <summary>Resolves step nodes by stepId or nodePath (same rules as Quicker.ActionDesigner.Backend).</summary>
public static class StepNodeResolver
{
    public sealed class ResolvedStepNode
    {
        public bool Success { get; set; }
        public string? ErrorMessage { get; set; }
        public JArray? ParentArray { get; set; }
        public int Index { get; set; }
        public string? NodePath { get; set; }
    }

    public static bool TryParsePatchObject(string stepPatchJson, out JObject? patchObj, out string? error)
    {
        patchObj = null;
        error = null;
        try
        {
            var token = JToken.Parse(stepPatchJson);
            if (token is not JObject obj)
            {
                error = "stepPatchJson must be a JSON object.";
                return false;
            }

            patchObj = obj;
            return true;
        }
        catch (JsonException ex)
        {
            error = "stepPatchJson parse failed: " + ex.Message;
            return false;
        }
    }

    public static ResolvedStepNode ResolveTargetStep(JArray rootSteps, string? stepId, string? nodePath)
    {
        if (!string.IsNullOrWhiteSpace(stepId))
        {
            if (TryFindStepById(rootSteps, stepId!.Trim(), out var parent, out var index, out var resolvedPath))
            {
                return new ResolvedStepNode
                {
                    Success = true,
                    ParentArray = parent,
                    Index = index,
                    NodePath = resolvedPath
                };
            }

            return new ResolvedStepNode { Success = false, ErrorMessage = $"stepId not found: {stepId}" };
        }

        if (!TryResolveByPath(rootSteps, nodePath!, out var pathParent, out var pathIndex, out var pathError))
        {
            return new ResolvedStepNode { Success = false, ErrorMessage = pathError };
        }

        return new ResolvedStepNode
        {
            Success = true,
            ParentArray = pathParent,
            Index = pathIndex,
            NodePath = NormalizeNodePath(nodePath)
        };
    }

    private static bool TryFindStepById(
        JArray steps,
        string stepId,
        out JArray? parentArray,
        out int index,
        out string? nodePath)
    {
        parentArray = null;
        index = -1;
        nodePath = null;
        return TryFindStepByIdCore(steps, stepId, new List<string>(), out parentArray, out index, out nodePath);
    }

    private static bool TryFindStepByIdCore(
        JArray steps,
        string stepId,
        List<string> pathTokens,
        out JArray? parentArray,
        out int index,
        out string? nodePath)
    {
        parentArray = null;
        index = -1;
        nodePath = null;
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject stepObj)
            {
                continue;
            }

            pathTokens.Add(i.ToString());
            if (string.Equals(stepObj["stepId"]?.ToString(), stepId, StringComparison.Ordinal))
            {
                parentArray = steps;
                index = i;
                nodePath = string.Join("/", pathTokens);
                return true;
            }

            if (TryGetChildSteps(stepObj, "ifSteps", out var ifSteps))
            {
                pathTokens.Add("if");
                if (TryFindStepByIdCore(ifSteps!, stepId, pathTokens, out parentArray, out index, out nodePath))
                {
                    return true;
                }

                pathTokens.RemoveAt(pathTokens.Count - 1);
            }

            if (TryGetChildSteps(stepObj, "elseSteps", out var elseSteps))
            {
                pathTokens.Add("else");
                if (TryFindStepByIdCore(elseSteps!, stepId, pathTokens, out parentArray, out index, out nodePath))
                {
                    return true;
                }

                pathTokens.RemoveAt(pathTokens.Count - 1);
            }

            pathTokens.RemoveAt(pathTokens.Count - 1);
        }

        return false;
    }

    private static bool TryResolveByPath(
        JArray rootSteps,
        string nodePath,
        out JArray? parentArray,
        out int index,
        out string? errorMessage)
    {
        parentArray = null;
        index = -1;
        errorMessage = null;
        var rawTokens = nodePath
            .Split('/')
            .Select(x => x.Trim())
            .Where(x => x.Length > 0)
            .ToArray();
        if (rawTokens.Length == 0)
        {
            errorMessage = "nodePath is empty.";
            return false;
        }

        var steps = rootSteps;
        for (var i = 0; i < rawTokens.Length; i++)
        {
            var token = rawTokens[i];
            if (!int.TryParse(token, out var stepIndex) || stepIndex < 0)
            {
                errorMessage = $"nodePath token at position {i + 1} must be non-negative step index.";
                return false;
            }

            if (stepIndex >= steps.Count)
            {
                errorMessage = $"nodePath index out of range at position {i + 1}.";
                return false;
            }

            if (i == rawTokens.Length - 1)
            {
                parentArray = steps;
                index = stepIndex;
                return true;
            }

            if (steps[stepIndex] is not JObject stepObj)
            {
                errorMessage = $"Step at nodePath position {i + 1} is not a JSON object.";
                return false;
            }

            var branchToken = rawTokens[++i].ToLowerInvariant();
            var branchName = branchToken switch
            {
                "if" or "ifsteps" => "ifSteps",
                "else" or "elsesteps" => "elseSteps",
                _ => string.Empty
            };
            if (branchName.Length == 0)
            {
                errorMessage = $"nodePath branch token at position {i + 1} must be if/else.";
                return false;
            }

            if (!TryGetChildSteps(stepObj, branchName, out var childSteps))
            {
                errorMessage = $"nodePath branch {branchToken} at position {i + 1} does not contain step array.";
                return false;
            }

            steps = childSteps!;
        }

        errorMessage = "Invalid nodePath.";
        return false;
    }

    private static bool TryGetChildSteps(JObject stepObj, string key, out JArray? childSteps)
    {
        childSteps = stepObj[key] as JArray;
        return childSteps != null;
    }

    public static string NormalizeNodePath(string? nodePath)
    {
        if (string.IsNullOrWhiteSpace(nodePath))
        {
            return string.Empty;
        }

        return string.Join("/", nodePath!.Split('/').Select(x => x.Trim()).Where(x => x.Length > 0));
    }
}
