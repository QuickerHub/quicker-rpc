using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Testing;

/// <summary>Resolve compressed step <c>inputParams</c> values from action variables.</summary>
public static class WorkspaceActionStepParams
{
    public static string? ResolveText(JToken? param, IReadOnlyDictionary<string, object?> variables)
    {
        if (param is null)
        {
            return null;
        }

        if (param is JObject obj)
        {
            if (obj["value"] is JValue value)
            {
                return value.Value?.ToString();
            }

            if (obj["varKey"] is JValue varKeyToken)
            {
                var key = varKeyToken.Value?.ToString();
                if (!string.IsNullOrWhiteSpace(key) && variables.TryGetValue(key!, out var bound))
                {
                    return bound?.ToString();
                }

                return null;
            }

            if (obj["file"] is JValue)
            {
                throw new InvalidOperationException(
                    "Step param uses file ref; compile workspace data before running tests.");
            }
        }

        return param.Type == JTokenType.String ? param.Value<string>() : param.ToString();
    }

    public static void ApplySubprogramOutputs(
        JObject? outputParams,
        IReadOnlyDictionary<string, string> subprogramOutputs,
        IDictionary<string, object?> actionVariables)
    {
        if (outputParams is null)
        {
            return;
        }

        foreach (var prop in outputParams.Properties())
        {
            var targetKey = ResolveOutputTargetKey(prop.Value);
            if (string.IsNullOrWhiteSpace(targetKey))
            {
                continue;
            }

            var sourceKey = prop.Name;
            if (sourceKey.StartsWith("var:", StringComparison.OrdinalIgnoreCase))
            {
                sourceKey = sourceKey.Substring("var:".Length);
            }

            if (subprogramOutputs.TryGetValue(sourceKey, out var outputValue))
            {
                actionVariables[targetKey] = outputValue;
            }
        }
    }

    private static string? ResolveOutputTargetKey(JToken? token)
    {
        if (token is null)
        {
            return null;
        }

        if (token.Type == JTokenType.String)
        {
            return token.Value<string>();
        }

        if (token is JObject obj)
        {
            return obj["varKey"]?.Value<string>() ?? obj["value"]?.Value<string>();
        }

        return token.ToString();
    }
}
