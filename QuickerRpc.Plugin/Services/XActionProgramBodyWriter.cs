using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Core;
using StorageActionStep = global::Quicker.Domain.Actions.X.Storage.ActionStep;
using StorageActionVariable = global::Quicker.Domain.Actions.X.Storage.ActionVariable;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Merges agent/program JSON into Quicker XAction body storage (camelCase), preserving existing metadata fields.
/// </summary>
internal static class XActionProgramBodyWriter
{
    private static readonly JsonSerializerSettings BodyJson = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    public static string MergeAndSerialize(string? existingData, JArray steps, JArray variables, string subProgramsJson)
    {
        var x = DeserializeExistingBody(existingData);
        x.Steps = DeserializeSteps(steps);
        x.Variables = DeserializeVariables(variables);
        if (!string.IsNullOrWhiteSpace(subProgramsJson))
        {
            x.SubPrograms = JsonConvert.DeserializeObject<IList<SubProgram>>(
                subProgramsJson,
                BodyJson);
        }

        return JsonConvert.SerializeObject(x, BodyJson);
    }

    public static XAction DeserializeXAction(string bodyJson) =>
        string.IsNullOrWhiteSpace(bodyJson)
            ? new XAction()
            : JsonConvert.DeserializeObject<XAction>(bodyJson, BodyJson) ?? new XAction();

    private static XAction DeserializeExistingBody(string? data)
    {
        if (string.IsNullOrWhiteSpace(data))
        {
            return new XAction();
        }

        return JsonConvert.DeserializeObject<XAction>(data, BodyJson) ?? new XAction();
    }

    private static IList<StorageActionStep> DeserializeSteps(JArray steps)
    {
        if (steps is null || steps.Count == 0)
        {
            return new List<StorageActionStep>();
        }

        return JsonConvert.DeserializeObject<List<StorageActionStep>>(
            JTokenCompat.Compact(steps),
            BodyJson) ?? new List<StorageActionStep>();
    }

    private static IList<StorageActionVariable> DeserializeVariables(JArray variables)
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
