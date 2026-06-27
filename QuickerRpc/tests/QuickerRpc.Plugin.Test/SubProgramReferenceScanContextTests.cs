using Microsoft.VisualStudio.TestTools.UnitTesting;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class SubProgramReferenceScanContextTests
{
    [TestMethod]
    public void BodyMayReference_requires_subprogram_step_and_target_needle()
    {
        var target = new SubProgram
        {
            Id = "11111111-1111-1111-1111-111111111111",
            Name = "HelperSp",
        };
        var context = SubProgramReferenceScanContext.Create(target, "%HelperSp%");

        Assert.IsTrue(context.BodyMayReference(
            """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:subprogram",
                  "inputParams": { "subProgram": { "value": "HelperSp" } }
                }
              ]
            }
            """));

        Assert.IsFalse(context.BodyMayReference(
            """
            {
              "steps": [
                { "stepRunnerKey": "sys:showmessage", "inputParams": {} }
              ]
            }
            """));

        Assert.IsFalse(context.BodyMayReference(
            """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:subprogram",
                  "inputParams": { "subProgram": { "value": "%OtherSp%" } }
                }
              ]
            }
            """));
    }
}
