using Microsoft.VisualStudio.TestTools.UnitTesting;
using Quicker.ActionRuntime.Abstractions.Models;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeProgramCsEmitterTests
{
    [TestMethod]
    public void Emit_EvalExpressionStep_GeneratesEvalCall()
    {
        var program = new XAction
        {
            Variables = [new ActionVariable { Key = "sum", DefaultValue = "" }],
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:evalexpression",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["expression"] = new ActionStepParam { Value = "$=10 + 32" },
                    },
                    OutputParams = new Dictionary<string, string> { ["result"] = "sum" },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program, "_runtime_expr_sum");

        StringAssert.Contains(cs, "ctx.EvalExpression(\"$=10 + 32\", useVariables: true)");
        StringAssert.Contains(cs, "ctx.SetVar(\"sum\"");
    }

    [TestMethod]
    public void Emit_AssignStep_GeneratesSetVar()
    {
        var program = new XAction
        {
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:assign",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["input"] = new ActionStepParam { Value = "ok" },
                    },
                    OutputParams = new Dictionary<string, string> { ["output"] = "result" },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program);

        StringAssert.Contains(cs, "ctx.SetVar(\"result\", \"ok\")");
    }

    [TestMethod]
    public void Emit_ReadFile_WithVarKey_GeneratesGetVar()
    {
        var program = new XAction
        {
            Variables = [new ActionVariable { Key = "path", DefaultValue = @"D:\data.txt" }],
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:readFile",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["path"] = new ActionStepParam { VarKey = "path" },
                    },
                    OutputParams = new Dictionary<string, string> { ["txt"] = "content" },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program, "read var");

        StringAssert.Contains(cs, "ctx.SetVar(\"path\"");
        StringAssert.Contains(cs, "ctx.GetVar(\"path\")");
        StringAssert.Contains(cs, "System.IO.File.ReadAllText(ctx.GetVar(\"path\"))");
        StringAssert.Contains(cs, "ctx.SetVar(\"content\"");
    }

    [TestMethod]
    public void Emit_Assign_WithInterpolate_UsesInterpolateNotEval()
    {
        var program = new XAction
        {
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:assign",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["input"] = new ActionStepParam { Value = "$$hello {name}" },
                    },
                    OutputParams = new Dictionary<string, string> { ["output"] = "greet" },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program);

        StringAssert.Contains(cs, "ctx.Interpolate(\"$$hello {name}\")");
        Assert.IsFalse(cs.Contains("EvalExpression(\"$$", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Emit_Assign_WithDollarEq_UsesEvalExpression()
    {
        var program = new XAction
        {
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:assign",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["input"] = new ActionStepParam { Value = "$=10 + {a}" },
                    },
                    OutputParams = new Dictionary<string, string> { ["output"] = "sum" },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program);

        StringAssert.Contains(cs, "ctx.EvalExpression(\"$=10 + {a}\", useVariables: true)");
    }

    [TestMethod]
    public void Emit_SubProgramStep_EmitsRunSp()
    {
        var program = new XAction
        {
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:subprogram",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["subProgram"] = new ActionStepParam { Value = "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322" },
                        ["var:badgeText"] = new ActionStepParam { VarKey = "title" },
                    },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program);

        StringAssert.Contains(cs, "ctx.RunSp(");
        StringAssert.Contains(cs, "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322");
        StringAssert.Contains(cs, "[\"badgeText\"] = ctx.GetVar(\"title\")");
        Assert.IsFalse(cs.Contains("ExecuteSubProgram", StringComparison.Ordinal));
    }

    [TestMethod]
    public void Emit_UnsupportedStep_EmitsExecuteStepWithParamDictionaries()
    {
        var program = new XAction
        {
            Steps =
            [
                new ActionStep
                {
                    StepRunnerKey = "sys:flaUi",
                    InputParams = new Dictionary<string, ActionStepParam>
                    {
                        ["title"] = new ActionStepParam { Value = "$$窗口 {name}" },
                        ["path"] = new ActionStepParam { VarKey = "path" },
                    },
                    OutputParams = new Dictionary<string, string> { ["result"] = "ok" },
                },
            ],
        };

        var cs = ActionRuntimeProgramCsEmitter.Emit(program);

        StringAssert.Contains(cs, "ctx.ExecuteStep(");
        StringAssert.Contains(cs, "\"sys:flaUi\"");
        StringAssert.Contains(cs, "new Dictionary<string, object>");
        StringAssert.Contains(cs, "[\"title\"] = ctx.Interpolate(\"$$窗口 {name}\")");
        StringAssert.Contains(cs, "[\"path\"] = ctx.GetVar(\"path\")");
        StringAssert.Contains(cs, "new Dictionary<string, string>");
        StringAssert.Contains(cs, "[\"result\"] = \"ok\"");
    }
}
