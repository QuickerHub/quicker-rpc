using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;
using Quicker.Utilities;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Builds an in-memory <see cref="ActionItem"/> from agent XAction JSON (no Quicker save).
/// </summary>
internal static class XActionEphemeralProgramBuilder
{
    public static bool TryBuild(
        string xActionJson,
        string? projectDirectory,
        out ActionItem? actionItem,
        out string? title,
        out string? error)
    {
        actionItem = null;
        title = null;
        error = null;

        if (string.IsNullOrWhiteSpace(xActionJson))
        {
            error = "xActionJson is required.";
            return false;
        }

        JObject xAction;
        try
        {
            xAction = JObject.Parse(xActionJson);
        }
        catch (Exception ex)
        {
            error = "xActionJson parse failed: " + ex.Message;
            return false;
        }

        var stepsToken = xAction["steps"];
        var variablesToken = xAction["variables"];
        if (stepsToken is not JArray steps || variablesToken is not JArray variables)
        {
            error = "xAction must contain steps and variables JSON arrays.";
            return false;
        }

        var formCompile = XActionFormSpecCompiler.Compile(xAction, projectDirectory);
        if (!formCompile.Success)
        {
            error = formCompile.ErrorMessage ?? "form spec compile failed.";
            return false;
        }

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variables);
        XActionProgramService.NormalizeStepsInputParamKeys(steps, catalog);
        XActionProgramService.EnsureEphemeralIds(steps, normalizedVariables);

        var subProgramsJson = SerializeSubProgramsJson(xAction["subPrograms"]);
        var bodyJson = XActionProgramBodyWriter.MergeAndSerialize(
            existingData: null,
            steps,
            normalizedVariables,
            subProgramsJson);

        if (!QuickerHost.IsRunningInQuicker())
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var item = ActionTypeManager.CreateActionItem(ActionType.XAction);
        if (item is null)
        {
            error = "ActionTypeManager could not create an XAction item.";
            return false;
        }

        item.ActionType = ActionType.XAction;
        item.Id = Guid.NewGuid().ToString("D");
        item.Title = ReadOptionalString(xAction["title"]) ?? "_inline_trace";
        item.Data = bodyJson;
        item.Data2 = string.Empty;
        item.Data3 = string.Empty;
        item.CreateTimeUtc = AppHelper.GetUtcNowForDb();
        item.LastEditTimeUtc = item.CreateTimeUtc;

        actionItem = item;
        title = item.Title;
        return true;
    }

    private static string SerializeSubProgramsJson(JToken? subProgramsOverride)
    {
        if (subProgramsOverride is JArray subProgramsArray)
        {
            return subProgramsArray.ToString(Formatting.None);
        }

        return "[]";
    }

    private static string? ReadOptionalString(JToken? token)
    {
        if (token is null || token.Type == JTokenType.Null)
        {
            return null;
        }

        var text = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
        text = text?.Trim();
        return text?.Length > 0 ? text : null;
    }
}
