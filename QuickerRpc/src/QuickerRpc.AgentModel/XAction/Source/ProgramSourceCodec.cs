// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Program source codec: CAW ↔ YAML (S0 + S1 if/each-sugar + M3 step-call sugar).
/// </summary>
public static class ProgramSourceCodec
{
    /// <summary>Encode canonical CAW JSON object to canonical source YAML text.</summary>
    public static string Encode(JObject caw)
    {
        var normalized = CawCanonicalizer.Canonicalize(caw);
        var working = (JObject)normalized.DeepClone();
        ProgramSourceBindFold.FoldInputsInPlace(working);
        ProgramSourceSubProgramStepSugar.ResugarInPlace(working);
        ProgramSourceStepCallSugar.ResugarInPlace(working);
        ProgramSourceIfSugar.ResugarInPlace(working);
        ProgramSourceEachSugar.ResugarInPlace(working);
        working["$schema"] = ProgramSourceSchemas.SourceV1;
        return ProgramSourceYamlEmitter.Emit(working);
    }

    /// <summary>Decode source YAML text to canonical CAW JSON object.</summary>
    public static JObject Decode(string sourceYaml) => Decode(sourceYaml, catalog: null);

    /// <summary>
    /// Decode source YAML text to canonical CAW JSON object. A non-null <paramref name="catalog"/>
    /// adds catalog checks that the catalog-free codec cannot make: <c>>></c> on a known runner
    /// without a primary output fails with <see cref="ProgramSourceCodes.NoPrimaryOutput"/>.
    /// </summary>
    public static JObject Decode(string sourceYaml, StepRunnerCatalog? catalog)
    {
        var token = ProgramSourceYamlParser.Parse(sourceYaml);
        if (token is not JObject root)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                "Program source root must be a mapping.");
        }

        var schema = root.Value<string>("$schema")?.Trim();
        if (!string.IsNullOrEmpty(schema)
            && !ProgramSourceSchemas.SupportedFormats.Any(format => string.Equals(schema, format, StringComparison.Ordinal)))
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.SchemaUnsupported,
                $"Unsupported schema '{schema}'.");
        }

        // each-sugar first so then/loopSteps become ifSteps; then if-sugar (nested if in
        // each body); step-call last (leaf M3 inside those lists).
        ProgramSourceEachSugar.DesugarInPlace(root, catalog);
        ProgramSourceIfSugar.DesugarInPlace(root);
        ProgramSourceSubProgramStepSugar.DesugarInPlace(root);
        ProgramSourceStepCallSugar.DesugarInPlace(root, catalog);
        RequireArrayProperty(root, "variables");
        RequireArrayProperty(root, "steps");
        RequireArrayProperty(root, "subPrograms");
        RequireVariableItems(root["variables"] as JArray, "variables");
        RequireStepKeys(root["steps"] as JArray, "steps");
        RequireSubProgramItems(root["subPrograms"] as JArray, "subPrograms");
        ProgramSourceBindFold.UnfoldInputsInPlace(root);
        ProgramSourceControlImplication.RequireConsistentBranchesRecursive(root);
        root["$schema"] = ProgramSourceSchemas.ActionV1;
        return CawCanonicalizer.Canonicalize(root);
    }

    private static void RequireArrayProperty(JObject container, string propertyName)
    {
        var token = container[propertyName];
        if (token is null || token.Type == JTokenType.Null)
        {
            return;
        }

        if (token is not JArray)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                $"{propertyName} must be a list.");
        }
    }

    private static void RequireVariableItems(JArray? variables, string path)
    {
        if (variables is null)
        {
            return;
        }

        for (var i = 0; i < variables.Count; i++)
        {
            var token = variables[i];
            if (token is not JObject)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.CawInvalid,
                    $"Each variable must be a mapping{ProgramSourceLocations.FormatStepContext(token, $"{path}[{i}]")}.");
            }
        }
    }

    private static void RequireSubProgramItems(JArray? subPrograms, string path)
    {
        if (subPrograms is null)
        {
            return;
        }

        for (var i = 0; i < subPrograms.Count; i++)
        {
            var token = subPrograms[i];
            var itemPath = $"{path}[{i}]";
            if (token is not JObject sp)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.CawInvalid,
                    $"Each subProgram must be a mapping{ProgramSourceLocations.FormatStepContext(token, itemPath)}.");
            }

            RequireArrayProperty(sp, "variables");
            RequireArrayProperty(sp, "steps");
            RequireArrayProperty(sp, "subPrograms");
            RequireVariableItems(sp["variables"] as JArray, itemPath + ".variables");
            RequireStepKeys(sp["steps"] as JArray, itemPath + ".steps");
            RequireSubProgramItems(sp["subPrograms"] as JArray, itemPath + ".subPrograms");
        }
    }

    private static void RequireStepKeys(JArray? steps, string path)
    {
        if (steps is null)
        {
            return;
        }

        for (var i = 0; i < steps.Count; i++)
        {
            var token = steps[i];
            var itemPath = $"{path}[{i}]";
            if (token is not JObject step)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.CawInvalid,
                    $"Each step must be a mapping{ProgramSourceLocations.FormatStepContext(token, itemPath)}.");
            }

            if (string.IsNullOrWhiteSpace(step.Value<string>("key")))
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    "Step is missing key after desugar (unrecognized call sugar?)."
                    + ProgramSourceLocations.FormatStepContext(step, itemPath));
            }

            RequireOptionalObject(step, "inputs", itemPath);
            RequireOptionalObject(step, "outputs", itemPath);
            RequireOptionalStepList(step, "ifSteps", itemPath);
            RequireOptionalStepList(step, "elseSteps", itemPath);
        }
    }

    private static void RequireOptionalObject(JObject step, string propertyName, string stepPath)
    {
        var token = step[propertyName];
        if (token is null || token.Type == JTokenType.Null)
        {
            return;
        }

        if (token is not JObject)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                $"{propertyName} must be a mapping{ProgramSourceLocations.FormatStepContext(step, stepPath)}.");
        }
    }

    private static void RequireOptionalStepList(JObject step, string propertyName, string stepPath)
    {
        var token = step[propertyName];
        if (token is null || token.Type == JTokenType.Null)
        {
            return;
        }

        if (token is not JArray array)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                $"{propertyName} must be a step list{ProgramSourceLocations.FormatStepContext(step, stepPath)}.");
        }

        RequireStepKeys(array, $"{stepPath}.{propertyName}");
    }

    /// <summary>提交前检查源码的规范化表示往返不漂移；不改写原始源码的注释与排版。</summary>
    public static void RequireLosslessRoundtrip(JObject caw, StepRunnerCatalog? catalog = null)
    {
        var expected = CawCanonicalizer.Canonicalize(caw);
        var actual = Decode(Encode(expected), catalog);
        if (!JToken.DeepEquals(expected, actual))
            throw new ProgramSourceException(ProgramSourceCodes.RoundtripMismatch,
                "源码与 JSON 往返结果不一致，已阻止保存；当前源码已保留。");
    }

    /// <summary>Canonical source text: encode(decode(text)).</summary>
    public static string CanonicalizeSource(string sourceYaml) => Encode(Decode(sourceYaml));

    /// <summary>Encode then decode; returns canonical CAW text.</summary>
    public static string RoundtripCawText(JObject caw)
    {
        var yaml = Encode(caw);
        var back = Decode(yaml);
        return CawCanonicalizer.CanonicalizeToText(back);
    }
}
