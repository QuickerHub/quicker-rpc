using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Patch;

/// <summary>
/// Resolves step list containers (root, ifSteps, elseSteps) and insert indices for patch add/move ops.
/// </summary>
public static class StepContainerResolver
{
    public sealed class ResolvedContainer
    {
        public bool Success { get; set; }
        public string? ErrorMessage { get; set; }
        public JArray? Container { get; set; }
        public string ContainerPath { get; set; } = "";
    }

    public static ResolvedContainer ResolveContainer(JArray rootSteps, string? containerPath)
    {
        var normalized = NormalizeContainerPath(containerPath);
        if (normalized.Length == 0)
        {
            return new ResolvedContainer { Success = true, Container = rootSteps, ContainerPath = "" };
        }

        if (!TryResolveContainerPath(rootSteps, normalized, out var container, out var error))
        {
            return new ResolvedContainer { Success = false, ErrorMessage = error };
        }

        return new ResolvedContainer { Success = true, Container = container, ContainerPath = normalized };
    }

    public static bool TryResolveInsertIndex(
        JArray rootSteps,
        JObject opEntry,
        out JArray? container,
        out int index,
        out string? containerPath,
        out string? error)
    {
        container = null;
        index = -1;
        containerPath = null;
        error = null;

        var explicitContainer = ReadNonEmptyString(opEntry["containerPath"]);
        if (opEntry["index"] is JValue { Type: JTokenType.Integer } indexToken)
        {
            var resolved = ResolveContainer(rootSteps, explicitContainer);
            if (!resolved.Success)
            {
                error = resolved.ErrorMessage;
                return false;
            }

            var insertIndex = indexToken.Value<int>();
            if (insertIndex < 0 || insertIndex > resolved.Container!.Count)
            {
                error = $"index {insertIndex} is out of range for container '{resolved.ContainerPath}' (count={resolved.Container!.Count}).";
                return false;
            }

            container = resolved.Container;
            index = insertIndex;
            containerPath = resolved.ContainerPath;
            return true;
        }

        if (TryResolveAnchorInsertIndex(rootSteps, opEntry["after"], insertAfter: true, out container, out index, out containerPath, out error))
        {
            return true;
        }

        if (error is not null)
        {
            return false;
        }

        if (TryResolveAnchorInsertIndex(rootSteps, opEntry["before"], insertAfter: false, out container, out index, out containerPath, out error))
        {
            return true;
        }

        if (error is not null)
        {
            return false;
        }

        if (explicitContainer is not null)
        {
            error = "containerPath requires index for insert position.";
            return false;
        }

        error = "add/move step requires containerPath+index, or after/before anchor.";
        return false;
    }

    private static bool TryResolveAnchorInsertIndex(
        JArray rootSteps,
        JToken? anchorToken,
        bool insertAfter,
        out JArray? container,
        out int index,
        out string? containerPath,
        out string? error)
    {
        container = null;
        index = -1;
        containerPath = null;
        error = null;

        if (anchorToken is null || anchorToken.Type == JTokenType.Null)
        {
            return false;
        }

        if (anchorToken is not JObject anchor)
        {
            error = "after/before must be a JSON object with stepId or nodePath.";
            return false;
        }

        var stepId = ReadNonEmptyString(anchor["stepId"]) ?? ReadNonEmptyString(anchor["id"]);
        var nodePath = ReadNonEmptyString(anchor["nodePath"]);
        if (string.IsNullOrEmpty(stepId) && string.IsNullOrEmpty(nodePath))
        {
            error = "after/before anchor must include stepId or nodePath.";
            return false;
        }

        var resolve = StepNodeResolver.ResolveTargetStep(rootSteps, stepId, nodePath);
        if (!resolve.Success)
        {
            error = resolve.ErrorMessage ?? "Anchor step not found.";
            return false;
        }

        container = resolve.ParentArray;
        index = insertAfter ? resolve.Index + 1 : resolve.Index;
        containerPath = ResolveContainerPathFromParent(rootSteps, container!);
        return true;
    }

    private static string ResolveContainerPathFromParent(JArray rootSteps, JArray parent)
    {
        if (ReferenceEquals(parent, rootSteps))
        {
            return "";
        }

        return FindContainerPathCore(rootSteps, parent, "") ?? "";
    }

    private static string? FindContainerPathCore(JArray steps, JArray target, string prefix)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject stepObj)
            {
                continue;
            }

            if (TryGetChildSteps(stepObj, "ifSteps", out var ifSteps) && ReferenceEquals(ifSteps, target))
            {
                return string.IsNullOrEmpty(prefix) ? $"{i}/if" : $"{prefix}/{i}/if";
            }

            if (TryGetChildSteps(stepObj, "elseSteps", out var elseSteps) && ReferenceEquals(elseSteps, target))
            {
                return string.IsNullOrEmpty(prefix) ? $"{i}/else" : $"{prefix}/{i}/else";
            }

            if (TryGetChildSteps(stepObj, "ifSteps", out var nestedIf))
            {
                var ifPath = string.IsNullOrEmpty(prefix) ? $"{i}/if" : $"{prefix}/{i}/if";
                var found = FindContainerPathCore(nestedIf!, target, ifPath);
                if (found is not null)
                {
                    return found;
                }
            }

            if (TryGetChildSteps(stepObj, "elseSteps", out var nestedElse))
            {
                var elsePath = string.IsNullOrEmpty(prefix) ? $"{i}/else" : $"{prefix}/{i}/else";
                var found = FindContainerPathCore(nestedElse!, target, elsePath);
                if (found is not null)
                {
                    return found;
                }
            }
        }

        return null;
    }

    private static bool TryResolveContainerPath(
        JArray rootSteps,
        string containerPath,
        out JArray? container,
        out string? error)
    {
        container = rootSteps;
        error = null;
        var tokens = containerPath
            .Split('/')
            .Select(x => x.Trim())
            .Where(x => x.Length > 0)
            .ToArray();
        if (tokens.Length == 0)
        {
            return true;
        }

        if (tokens.Length % 2 != 0)
        {
            error = "containerPath must be '<stepIndex>/if|else' segments (e.g. 1/if).";
            return false;
        }

        JArray steps = rootSteps;
        for (var i = 0; i < tokens.Length; i += 2)
        {
            var indexToken = tokens[i];
            if (!int.TryParse(indexToken, out var stepIndex) || stepIndex < 0)
            {
                error = $"containerPath step index at segment {i / 2 + 1} must be non-negative.";
                return false;
            }

            if (stepIndex >= steps.Count)
            {
                error = $"containerPath step index out of range at segment {i / 2 + 1}.";
                return false;
            }

            if (steps[stepIndex] is not JObject stepObj)
            {
                error = $"Step at containerPath segment {i / 2 + 1} is not a JSON object.";
                return false;
            }

            var branchToken = tokens[i + 1].ToLowerInvariant();
            var branchName = branchToken switch
            {
                "if" or "ifsteps" => "ifSteps",
                "else" or "elsesteps" => "elseSteps",
                _ => string.Empty
            };
            if (branchName.Length == 0)
            {
                error = $"containerPath branch at segment {i / 2 + 1} must be if or else.";
                return false;
            }

            if (!TryGetChildSteps(stepObj, branchName, out var childSteps))
            {
                stepObj[branchName] = new JArray();
                childSteps = (JArray)stepObj[branchName]!;
            }

            steps = childSteps!;
        }

        container = steps;
        return true;
    }

    private static bool TryGetChildSteps(JObject stepObj, string key, out JArray? childSteps)
    {
        childSteps = stepObj[key] as JArray;
        return childSteps is not null;
    }

    public static string NormalizeContainerPath(string? containerPath)
    {
        if (string.IsNullOrWhiteSpace(containerPath))
        {
            return "";
        }

        return string.Join("/", containerPath!.Split('/').Select(x => x.Trim()).Where(x => x.Length > 0));
    }

    private static string? ReadNonEmptyString(JToken? token)
    {
        if (token?.Type != JTokenType.String)
        {
            return null;
        }

        var value = token.Value<string>()?.Trim();
        return string.IsNullOrEmpty(value) ? null : value;
    }
}
