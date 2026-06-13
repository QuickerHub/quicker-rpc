using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class SubProgramStepReferenceMatcherTests
{
    [TestMethod]
    public void StepsUseSubProgram_matches_by_name_and_call_identifier()
    {
        var target = new SubProgram
        {
            Id = "11111111-1111-1111-1111-111111111111",
            Name = "HelperSp",
        };
        var callId = "%HelperSp%";

        var steps = JArray.Parse(
            """
            [
              {
                "stepRunnerKey": "sys:subprogram",
                "inputParams": {
                  "subProgram": { "value": "HelperSp" }
                }
              }
            ]
            """);

        Assert.IsTrue(SubProgramStepReferenceMatcher.StepsUseSubProgram(steps, target, callId));

        var otherSteps = JArray.Parse(
            """
            [
              {
                "stepRunnerKey": "sys:subprogram",
                "inputParams": {
                  "subProgram": { "value": "%OtherSp%" }
                }
              }
            ]
            """);

        Assert.IsFalse(SubProgramStepReferenceMatcher.StepsUseSubProgram(otherSteps, target, callId));
    }

    [TestMethod]
    public void StepsDedicatedToSubProgram_requires_all_steps_to_call_target()
    {
        var target = new SubProgram
        {
            Id = "33333333-3333-3333-3333-333333333333",
            Name = "WrappedSp",
        };
        var callId = "%WrappedSp%";

        var dedicatedSteps = JArray.Parse(
            """
            [
              {
                "stepRunnerKey": "sys:subprogram",
                "inputParams": { "subProgram": { "value": "WrappedSp" } }
              },
              {
                "stepRunnerKey": "sys:subprogram",
                "inputParams": { "subProgram": { "value": "%WrappedSp%" } }
              }
            ]
            """);

        Assert.IsTrue(SubProgramStepReferenceMatcher.StepsDedicatedToSubProgram(dedicatedSteps, target, callId));

        var mixedSteps = JArray.Parse(
            """
            [
              {
                "stepRunnerKey": "sys:subprogram",
                "inputParams": { "subProgram": { "value": "WrappedSp" } }
              },
              {
                "stepRunnerKey": "sys:showmessage",
                "inputParams": {}
              }
            ]
            """);

        Assert.IsFalse(SubProgramStepReferenceMatcher.StepsDedicatedToSubProgram(mixedSteps, target, callId));
        Assert.IsFalse(SubProgramStepReferenceMatcher.StepsDedicatedToSubProgram(new JArray(), target, callId));
    }

    [TestMethod]
    public void MatchesSubProgramReference_accepts_call_identifier_without_percent()
    {
        var target = new SubProgram
        {
            Id = "22222222-2222-2222-2222-222222222222",
            Name = "TargetSp",
        };

        Assert.IsTrue(SubProgramStepReferenceMatcher.MatchesSubProgramReference(
            "%TargetSp%",
            target,
            "%TargetSp%"));
        Assert.IsTrue(SubProgramStepReferenceMatcher.MatchesSubProgramReference(
            "TargetSp",
            target,
            "%TargetSp%"));
    }
}
