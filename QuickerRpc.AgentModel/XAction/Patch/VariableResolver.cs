using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Patch;

/// <summary>Resolves action variables by stable <c>id</c> or variable <c>key</c>.</summary>
public static class VariableResolver
{
    public sealed class ResolvedVariable
    {
        public bool Success { get; set; }
        public string? ErrorMessage { get; set; }
        public JArray? ParentArray { get; set; }
        public int Index { get; set; }
        public string? VariableId { get; set; }
        public string? VariableKey { get; set; }
    }

    public static ResolvedVariable ResolveTargetVariable(
        JArray variables,
        string? variableId,
        string? variableKey)
    {
        if (!string.IsNullOrWhiteSpace(variableId))
        {
            var id = variableId!.Trim();
            for (var i = 0; i < variables.Count; i++)
            {
                if (variables[i] is not JObject variableObj)
                {
                    continue;
                }

                if (string.Equals(variableObj["id"]?.ToString(), id, StringComparison.Ordinal))
                {
                    return new ResolvedVariable
                    {
                        Success = true,
                        ParentArray = variables,
                        Index = i,
                        VariableId = id,
                        VariableKey = variableObj["key"]?.ToString()
                    };
                }
            }

            return new ResolvedVariable { Success = false, ErrorMessage = $"variableId not found: {id}" };
        }

        if (string.IsNullOrWhiteSpace(variableKey))
        {
            return new ResolvedVariable { Success = false, ErrorMessage = "Either variableId or variableKey is required." };
        }

        var key = variableKey!.Trim();
        for (var i = 0; i < variables.Count; i++)
        {
            if (variables[i] is not JObject variableObj)
            {
                continue;
            }

            if (string.Equals(variableObj["key"]?.ToString(), key, StringComparison.Ordinal))
            {
                return new ResolvedVariable
                {
                    Success = true,
                    ParentArray = variables,
                    Index = i,
                    VariableId = variableObj["id"]?.ToString(),
                    VariableKey = key
                };
            }
        }

        return new ResolvedVariable { Success = false, ErrorMessage = $"variableKey not found: {key}" };
    }
}
