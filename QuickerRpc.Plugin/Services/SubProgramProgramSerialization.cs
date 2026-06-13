using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using QuickerRpc.AgentModel.Core;
using StorageActionStep = global::Quicker.Domain.Actions.X.Storage.ActionStep;
using StorageActionVariable = global::Quicker.Domain.Actions.X.Storage.ActionVariable;

namespace QuickerRpc.Plugin.Services;

/// <summary>JSON round-trip between agent JArrays and <see cref="SubProgram"/> step/variable lists.</summary>
internal static class SubProgramProgramSerialization
{
    private static readonly JsonSerializerSettings BodyJson = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    public static string StepsToJson(object? steps)
    {
        if (steps is null)
        {
            return "[]";
        }

        if (steps is System.Collections.ICollection collection && collection.Count == 0)
        {
            return "[]";
        }

        return JsonConvert.SerializeObject(steps, BodyJson);
    }

    public static JArray StepsToJArray(object? steps)
    {
        var json = StepsToJson(steps);
        return JArray.Parse(json);
    }

    public static JArray VariablesToJArray(object? variables)
    {
        if (variables is null)
        {
            return new JArray();
        }

        if (variables is System.Collections.ICollection collection && collection.Count == 0)
        {
            return new JArray();
        }

        var json = JsonConvert.SerializeObject(variables, BodyJson);
        return JArray.Parse(json);
    }

    public static IList<StorageActionStep> DeserializeSteps(JArray steps)
    {
        if (steps is null || steps.Count == 0)
        {
            return new List<StorageActionStep>();
        }

        return JsonConvert.DeserializeObject<List<StorageActionStep>>(
            JTokenCompat.Compact(steps),
            BodyJson) ?? new List<StorageActionStep>();
    }

    public static IList<StorageActionVariable> DeserializeVariables(JArray variables)
    {
        if (variables is null || variables.Count == 0)
        {
            return new List<StorageActionVariable>();
        }

        return JsonConvert.DeserializeObject<List<StorageActionVariable>>(
            JTokenCompat.Compact(variables),
            BodyJson) ?? new List<StorageActionVariable>();
    }
}
