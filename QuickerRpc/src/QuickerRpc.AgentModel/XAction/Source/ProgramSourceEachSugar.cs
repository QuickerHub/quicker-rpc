// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// S1 each-sugar: <c>each</c> + <c>then</c> (decode also accepts <c>loopSteps</c>)
/// ↔ <c>sys:each</c> + <c>ifSteps</c> (CAW nested-step list).
/// Encode emits <c>then</c> only. Empty body stays leaf M3 <c>each:</c> (no <c>then</c>).
/// </summary>
public static class ProgramSourceEachSugar
{
    internal const string EachRunnerKey = "sys:each";

    public static void DesugarInPlace(JObject root) => DesugarInPlace(root, catalog: null);

    /// <param name="root">Program (or subprogram) source object, desugared in place.</param>
    /// <param name="catalog">Optional; forwarded to the step-call expansion for the <c>>></c> check.</param>
    public static void DesugarInPlace(JObject root, StepRunnerCatalog? catalog)
    {
        if (root["steps"] is JArray steps)
        {
            DesugarSteps(steps, catalog);
        }

        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                DesugarInPlace(sp, catalog);
            }
        }
    }

    public static void ResugarInPlace(JObject root)
    {
        if (root["steps"] is JArray steps)
        {
            ResugarSteps(steps);
        }

        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                ResugarInPlace(sp);
            }
        }
    }

    private static void DesugarSteps(JArray steps, StepRunnerCatalog? catalog)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            if (IsEachSugarWithBody(step))
            {
                steps[i] = ProgramSourceStepCallSugar.ExpandStepCall(
                    EachRunnerKey,
                    step["each"]!,
                    step,
                    catalog);
                step = (JObject)steps[i]!;
            }
            else
            {
                LiftSiblingEachBody(step);
            }

            VisitNestedStepLists(step, nested => DesugarSteps(nested, catalog));
        }
    }

    /// <summary>
    /// Walk CAW nested lists and already-resugared if/each bodies so encode can
    /// still find <c>sys:each</c> inside <c>if.then</c> after if-sugar runs first.
    /// </summary>
    private static void VisitNestedStepLists(JObject step, Action<JArray> visit)
    {
        if (step["ifSteps"] is JArray ifSteps)
        {
            visit(ifSteps);
        }

        if (step["elseSteps"] is JArray elseSteps)
        {
            visit(elseSteps);
        }

        if (step["if"] is JObject ifBody)
        {
            VisitIfSugarBody(ifBody, visit);
        }

        if (step["each"] is JObject eachBody)
        {
            if (eachBody["then"] is JArray eachThen)
            {
                visit(eachThen);
            }

            if (eachBody["loopSteps"] is JArray eachLoop)
            {
                visit(eachLoop);
            }
        }
    }

    private static void VisitIfSugarBody(JObject ifBody, Action<JArray> visit)
    {
        if (ifBody["then"] is JArray thenSteps)
        {
            visit(thenSteps);
        }

        if (ifBody["else"] is JArray elseSteps)
        {
            visit(elseSteps);
        }

        if (ifBody["else if"] is JObject elseIf)
        {
            VisitIfSugarBody(elseIf, visit);
        }
    }

    private static bool IsEachSugarWithBody(JObject step) =>
        step["key"] is null
        && step.Count == 1
        && step["each"] is JObject body
        && (body["then"] is not null || body["loopSteps"] is not null);

    private static void LiftSiblingEachBody(JObject step)
    {
        var key = step.Value<string>("key");
        if (key is not null && SysRunnerKey.TryNormalizePrefix(key, out var normalized))
        {
            key = normalized;
        }

        if (!string.Equals(key, EachRunnerKey, StringComparison.Ordinal))
        {
            return;
        }

        JArray? body = null;
        string? used = null;
        foreach (var name in new[] { "then", "loopSteps" })
        {
            var token = step[name];
            if (token is null || token.Type == JTokenType.Null)
            {
                continue;
            }

            if (token is not JArray list)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    $"{name} must be a step list."
                    + ProgramSourceLocations.FormatStepContext(step, string.Empty));
            }

            if (used is not null)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    "each cannot set both then and loopSteps."
                    + ProgramSourceLocations.FormatStepContext(step, string.Empty));
            }

            body = list;
            used = name;
        }

        if (used is null || body is null)
        {
            return;
        }

        step.Remove(used);
        var existingToken = step["ifSteps"];
        if (existingToken is JArray existing)
        {
            if (existing.Count > 0 && body.Count > 0)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    "each cannot mix ifSteps with then/loopSteps."
                    + ProgramSourceLocations.FormatStepContext(step, string.Empty));
            }

            if (existing.Count == 0 && body.Count > 0)
            {
                step["ifSteps"] = body;
            }

            return;
        }

        if (existingToken is not null && existingToken.Type != JTokenType.Null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                "ifSteps must be a step list."
                + ProgramSourceLocations.FormatStepContext(step, string.Empty));
        }

        if (body.Count > 0)
        {
            step["ifSteps"] = body;
        }
    }

    private static void ResugarSteps(JArray steps)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            VisitNestedStepLists(step, ResugarSteps);

            if (ProgramSourceStepCallSugar.TryResugarEachWithThen(step, out var sugared))
            {
                steps[i] = sugared;
            }
        }
    }
}
