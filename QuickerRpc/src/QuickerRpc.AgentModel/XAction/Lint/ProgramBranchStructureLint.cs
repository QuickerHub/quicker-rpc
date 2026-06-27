using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Validates <c>ifSteps</c>/<c>elseSteps</c> placement against branching step runners.</summary>
public static class ProgramBranchStructureLint
{
    public static IList<ProgramSyntaxIssue> Analyze(JObject data)
    {
        var issues = new List<ProgramSyntaxIssue>();
        if (data["steps"] is not JArray steps)
        {
            return issues;
        }

        ProgramSyntaxStepPaths.Walk(
            steps,
            (step, stepPath, stepId, runnerKey) => AnalyzeStepBranches(step, stepPath, stepId, runnerKey, issues));

        return issues;
    }

    private static void AnalyzeStepBranches(
        JObject step,
        string stepPath,
        string stepId,
        string runnerKey,
        IList<ProgramSyntaxIssue> issues)
    {
        var (hasIfBranch, hasElseBranch) = StepBranchWireCoercer.InferBranches(runnerKey);
        var hasIfSteps = step["ifSteps"] is JArray ifSteps && ifSteps.Count > 0;
        var hasElseSteps = step["elseSteps"] is JArray elseSteps && elseSteps.Count > 0;

        if (hasIfSteps && !hasIfBranch)
        {
            issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                ProgramSyntaxIssueSeverity.Warning,
                "INVALID_BRANCH_FIELD",
                "ifSteps is only valid on branching steps (sys:if, sys:simpleIf, sys:loop, sys:group, …); omit on leaf steps.",
                stepPath,
                stepId,
                runnerKey,
                paramName: "ifSteps",
                variableKey: null));
        }

        if (hasElseSteps && !hasElseBranch)
        {
            issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                ProgramSyntaxIssueSeverity.Warning,
                "INVALID_BRANCH_FIELD",
                "elseSteps is only valid on sys:if; omit on other step runners.",
                stepPath,
                stepId,
                runnerKey,
                paramName: "elseSteps",
                variableKey: null));
        }
    }
}
