using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parses clipboard JSON for Action Designer paste: full native XAction or agent compressed program body.
/// </summary>
internal static class ActionDesignerXActionImport
{
    public static bool TryParse(string json, out XAction? xAction, out string? error)
    {
        xAction = null;
        error = null;
        if (string.IsNullOrWhiteSpace(json))
        {
            error = "Clipboard is empty.";
            return false;
        }

        JObject root;
        try
        {
            root = JObject.Parse(json);
        }
        catch (Exception ex)
        {
            error = "Invalid JSON: " + ex.Message;
            return false;
        }

        if (TryParseProgramBody(root, out xAction, out error) && xAction is not null)
        {
            return true;
        }

        try
        {
            xAction = JsonConvert.DeserializeObject<XAction>(json);
        }
        catch (Exception ex)
        {
            error = "Invalid XAction JSON: " + ex.Message;
            return false;
        }

        if (xAction is null)
        {
            error = "Invalid XAction JSON.";
            return false;
        }

        if (CountSteps(xAction) == 0 && CountStepsInJson(root) > 0)
        {
            error = "Clipboard JSON contains steps but could not be applied. "
                + "Use 「复制动作定义」 output, or compressed JSON with steps/variables arrays.";
            xAction = null;
            return false;
        }

        return true;
    }

    private static bool TryParseProgramBody(JObject root, out XAction? xAction, out string? error)
    {
        xAction = null;
        error = null;

        var steps = root["steps"] as JArray ?? root["Steps"] as JArray;
        var variables = root["variables"] as JArray ?? root["Variables"] as JArray;
        if (steps is null || variables is null)
        {
            return false;
        }

        var formCompile = XActionFormSpecCompiler.Compile(root, projectDirectory: null);
        if (!formCompile.Success)
        {
            error = formCompile.ErrorMessage ?? "Form spec compile failed.";
            return false;
        }

        try
        {
            var stepsClone = (JArray)steps.DeepClone();
            var varsClone = (JArray)variables.DeepClone();
            InputParamWireCoercer.ExpandStepsRecursive(stepsClone);
            VariableDefaultValueWireCoercer.ExpandVariablesRecursive(varsClone);

            var catalog = StepRunnerCatalogFromQuicker.Build();
            XActionProgramService.NormalizeStepsInputParamKeys(stepsClone, catalog);
            var normalizedVars = XActionProgramService.NormalizeVariablesForSave(varsClone);

            var subProgramsToken = root["subPrograms"] ?? root["SubPrograms"];
            var subProgramsJson = subProgramsToken is JArray subPrograms && subPrograms.Count > 0
                ? JTokenCompat.Compact(subPrograms)
                : "[]";

            var bodyJson = XActionProgramBodyWriter.MergeAndSerialize(null, stepsClone, normalizedVars, subProgramsJson);
            xAction = XActionProgramBodyWriter.DeserializeXAction(bodyJson);
            CopyOptionalMetadata(root, xAction);
            return true;
        }
        catch (Exception ex)
        {
            error = "Failed to parse program body: " + ex.Message;
            return false;
        }
    }

    private static void CopyOptionalMetadata(JObject root, XAction xAction)
    {
        var summary = ReadString(root, "summaryExpression", "SummaryExpression");
        if (summary is not null)
        {
            xAction.SummaryExpression = summary;
        }
    }

    private static string? ReadString(JObject obj, string camel, string pascal)
    {
        var token = obj[camel] ?? obj[pascal];
        return token?.Type == JTokenType.String ? token.Value<string>() : null;
    }

    private static int CountSteps(XAction action) => action.Steps?.Count ?? 0;

    private static int CountStepsInJson(JObject root)
    {
        var steps = root["steps"] as JArray ?? root["Steps"] as JArray;
        return steps?.Count ?? 0;
    }
}
